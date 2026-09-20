import { connect, WindowMessenger, CallOptions, Reply } from "penpal";
import { createMediaProbe } from "./media.js";

// A feasibility fixture, not a permission guard. Only run on the local test server.
const config = window.probeConfig;
const children = [];
let parentRemote;
let peer;
let receivedStream;
let video;
let sourceStream;
let transferredBuffer;
let cancelled;
let mediaStage;
const errorInfo = (error) => ({
  name: error.name, message: error.message, code: error.code,
  domException: error instanceof DOMException,
});
const outcome = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (error) { return { ok: false, error: errorInfo(error) }; }
};
const timeout = (promise, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Probe timed out")), ms);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
const callOptions = () => new CallOptions({ timeout: 2000 });

async function inspect() {
  const native = {};
  native.media = await outcome(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    const kinds = stream.getTracks().map((track) => track.kind);
    stream.getTracks().forEach((track) => track.stop());
    return kinds;
  });
  native.location = await outcome(() => timeout(new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(config.manual ? { received: true }
        : { latitude: coords.latitude, longitude: coords.longitude }),
      reject, { timeout: 2000 },
    )), 3000));
  native.files = await outcome(() => navigator.storage.getDirectory().then((h) => h.kind));
  // Only probe the sandbox's rejection. Never open a host file picker.
  native.picker = window === window.top ? { skipped: "Avoid opening a native picker" }
    : await outcome(() => showOpenFilePicker());
  native.serial = await outcome(() => navigator.serial.getPorts().then((p) => p.length));
  native.usb = await outcome(() => navigator.usb.getDevices().then((d) => d.length));
  native.notifications = { permission: window.Notification?.permission };
  const shims = {};
  for (const [object, key] of [
    [navigator, "geolocation"], [navigator, "mediaDevices"],
    [navigator, "serial"], [navigator, "usb"],
    [window, "showOpenFilePicker"], [window, "Notification"],
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    shims[key] = await outcome(() => {
      const replacement = {};
      Object.defineProperty(object, key, { configurable: true, value: replacement });
      return object[key] === replacement;
    });
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
  }
  return { origin: window.origin, secure: isSecureContext, native, shims };
}

async function transport() {
  const r = parentRemote;
  const result = {};
  result.file = await outcome(async () => {
    const file = await r.file(callOptions());
    return { native: file instanceof File, name: file.name, text: await file.text() };
  });
  result.buffer = await outcome(async () => {
    const buffer = await r.buffer(callOptions());
    return { bytes: [...new Uint8Array(buffer)], senderDetached: await r.bufferDetached() };
  });
  result.readable = await outcome(async () => {
    const stream = await r.readable(callOptions());
    const reader = stream.getReader();
    const first = await reader.read();
    await reader.cancel("probe cancellation");
    return { native: stream instanceof ReadableStream, bytes: [...first.value], cancelled: await r.cancelled() };
  });
  result.writable = await outcome(async () => {
    const chunks = [];
    const stream = new WritableStream({ write(value) { chunks.push(...value); } });
    await r.write(stream, new CallOptions({ transferables: [stream], timeout: 2000 }));
    return { chunks };
  });
  result.callback = await outcome(() => r.echo(() => {}, callOptions()));
  result.domException = await outcome(() => r.deny(callOptions()));
  // The root alone owns an OPFS handle. Browser deserialization may fail before
  // Penpal sees a reply, so this operation deliberately has a call timeout.
  result.handle = await outcome(() => r.handle(callOptions()));
  result.eventTarget = await outcome(() => r.eventTarget(callOptions()));
  return result;
}

function iceComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return timeout(new Promise((resolve) => {
    const listener = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", listener);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", listener);
  }));
}

async function receiveOffer(description) {
  peer?.close();
  peer = new RTCPeerConnection({ iceServers: [] });
  receivedStream = new MediaStream();
  peer.ontrack = ({ track }) => receivedStream.addTrack(track);
  await peer.setRemoteDescription(description);
  await peer.setLocalDescription(await peer.createAnswer());
  await iceComplete(peer);
  video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.srcObject = receivedStream;
  document.body.append(video);
  return peer.localDescription.toJSON();
}

async function receivedMedia() {
  mediaStage = "video playback";
  await timeout(video.play());
  await timeout(new Promise((resolve) => video.requestVideoFrameCallback(resolve)));
  mediaStage = "MediaRecorder";
  const recorded = await timeout(new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(receivedStream);
    const chunks = [];
    recorder.ondataavailable = ({ data }) => chunks.push(data);
    recorder.onerror = reject;
    recorder.onstop = () => resolve(new Blob(chunks).size);
    recorder.start();
    setTimeout(() => recorder.stop(), 300);
  }));
  mediaStage = "Web Audio";
  const audio = new AudioContext();
  const audioSource = audio.createMediaStreamSource(receivedStream);
  mediaStage = "onward RTCPeerConnection";
  const onward = new RTCPeerConnection({ iceServers: [] });
  const senders = receivedStream.getTracks().map((track) => onward.addTrack(track, receivedStream));
  onward.close();
  audioSource.disconnect();
  await audio.close();
  const stats = [...(await peer.getStats()).values()]
    .filter((entry) => entry.type === "inbound-rtp")
    .map(({ kind, bytesReceived, framesDecoded }) => ({ kind, bytesReceived, framesDecoded }));
  return {
    native: receivedStream instanceof MediaStream,
    tracks: receivedStream.getTracks().map((t) => ({ kind: t.kind, settings: t.getSettings() })),
    video: { width: video.videoWidth, height: video.videoHeight },
    recordedBytes: recorded, onwardSenders: senders.length, stats,
  };
}

async function media(path = [children.length - 1]) {
  const remote = children[path[0]].remote;
  const send = (method, ...args) => leafCall(path, method, args);
  const started = performance.now();
  mediaStage = "host getUserMedia";
  sourceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  mediaStage = "host peer construction";
  const pc = new RTCPeerConnection({ iceServers: [] });
  try {
    let cloneResult, transferResult;
    if (path.length === 1) {
      mediaStage = "clone/transfer probes";
      cloneResult = await outcome(() => remote.echo(sourceStream, callOptions()));
      const track = sourceStream.getVideoTracks()[0].clone();
      transferResult = await outcome(() => remote.echo(track,
        new CallOptions({ transferables: [track], timeout: 2000 })));
      track.stop();
    }
    for (const sourceTrack of sourceStream.getTracks()) pc.addTrack(sourceTrack, sourceStream);
    mediaStage = "host offer";
    await pc.setLocalDescription(await pc.createOffer());
    await iceComplete(pc);
    mediaStage = "child answer";
    const answer = await send("receiveOffer", pc.localDescription.toJSON());
    await pc.setRemoteDescription(answer);
    mediaStage = "child media consumers";
    const received = await send("receivedMedia");
    const elapsedMs = Math.round(performance.now() - started);
    sourceStream.getTracks().forEach((track) => track.stop());
    pc.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = await send("mediaCounters");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await send("mediaCounters");
    return { cloneResult, transferResult, received, elapsedMs,
      hostStop: { before, after, noMoreBytes: JSON.stringify(before) === JSON.stringify(after) } };
  } finally {
    sourceStream.getTracks().forEach((track) => track.stop());
    pc.close();
    await send("closeMedia");
  }
}

async function activation() {
  return { active: navigator.userActivation.isActive, ancestor: parentRemote ? await parentRemote.activation() : null };
}

function connectWindow(remoteWindow, channel) {
  return connect({
    messenger: new WindowMessenger({ remoteWindow, allowedOrigins: ["*"] }),
    channel, methods, timeout: 5000,
  });
}

async function mount(mode, withAllow) {
  const iframe = document.createElement("iframe");
  const channel = crypto.randomUUID();
  iframe.sandbox.add(...config.sandbox);
  // Trusted fixture-only control, never used by production transclusion.
  if (mode === "same-origin") iframe.sandbox.add("allow-same-origin");
  iframe.allow = withAllow ? config.allow : config.withoutPeripherals;
  const html = `<!doctype html><body><button id="activate">Activation probe</button><script>window.probeConfig=${JSON.stringify({ ...config, channel })}</script><script type="module" src="${config.base}/probe.js"></script>`;
  let blobUrl;
  if (mode === "blob") {
    blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    iframe.src = blobUrl;
  } else if (mode === "data") iframe.src = `data:text/html,${encodeURIComponent(html)}`;
  else iframe.srcdoc = html;
  document.body.append(iframe);
  const connection = connectWindow(iframe.contentWindow, channel);
  const remote = await connection.promise;
  children.push({ iframe, remote, connection, blobUrl });
  return children.length - 1;
}

async function dispose() {
  for (const child of children.splice(0)) {
    await child.remote.dispose();
    child.connection.destroy();
    child.iframe.remove();
    if (child.blobUrl) URL.revokeObjectURL(child.blobUrl);
  }
}

async function lifetime() {
  await mount("srcdoc", false);
  const child = children.pop();
  try {
    const stream = await child.remote.readable();
    const pending = child.remote.pending().catch(errorInfo);
    child.connection.destroy();
    const reader = stream.getReader();
    const data = await timeout(reader.read());
    await reader.cancel("cleanup after RPC destruction");
    return { pending: await pending, streamSurvivesRpcDestroy: !data.done, bytes: [...data.value] };
  } finally {
    child.connection.destroy();
    child.iframe.remove();
  }
}

function leafCall(path, method, args) {
  const remote = children[path[0]].remote;
  return path.length === 1 ? remote[method](...args)
    : remote.leafCall(path.slice(1), method, args);
}

const mediaProbe = createMediaProbe({
  callLeaf: leafCall,
  callParent: (method, args) => parentRemote[method](...args),
  getRemote: (index) => children[index].remote,
});
const methods = {
  ...mediaProbe.methods,
  inspect, transport, receiveOffer, mount, activation, dispose, leafCall,
  receivedMedia: () => receivedMedia().catch((error) => {
    throw new Error(`${mediaStage}: ${error.name}: ${error.message}`);
  }),
  async mediaCounters() {
    return [...(await peer.getStats()).values()]
      .filter((entry) => entry.type === "inbound-rtp")
      .map(({ kind, bytesReceived }) => ({ kind, bytesReceived }));
  },
  closeMedia() { peer?.close(); video?.remove(); },
  async childCall(index, method, args = []) { return children[index].remote[method](...args); },
  echo: (value) => value,
  pending: () => new Promise(() => {}),
  file: () => new File(["peripheral probe"], "probe.txt", { type: "text/plain" }),
  buffer() {
    transferredBuffer = new Uint8Array([1, 2, 3]).buffer;
    return new Reply(transferredBuffer, { transferables: [transferredBuffer] });
  },
  bufferDetached: () => transferredBuffer.byteLength === 0,
  readable() {
    cancelled = undefined;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([4, 5, 6])); },
      cancel(reason) { cancelled = reason; },
    });
    return new Reply(stream, { transferables: [stream] });
  },
  cancelled: () => cancelled,
  async write(stream) {
    const writer = stream.getWriter();
    await writer.write(new Uint8Array([7, 8, 9]));
    await writer.close();
  },
  deny() { throw new DOMException("Probe denial", "NotAllowedError"); },
  handle: () => navigator.storage.getDirectory(),
  eventTarget: () => new EventTarget(),
};
window.probe = { ...methods, lifetime,
  mediaPrepare: mediaProbe.prepare, mediaStopSource: mediaProbe.stopSource,
  mediaPortability: mediaProbe.run,
  mediaDirect: (path) => mediaProbe.direct(path, (tracks) => new CallOptions({ transferables: tracks, timeout: 5000 })),
  media: (...args) => media(...args).catch((error) => {
  throw new Error(`${mediaStage}: ${error.name}: ${error.message}`);
}) };
if (window !== window.top) {
  const connection = connectWindow(window.parent, config.channel);
  parentRemote = await connection.promise;
  document.querySelector("#activate").onclick = async () => {
    window.activationResult = await activation();
  };
}
