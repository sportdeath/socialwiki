// Focused portability experiments. Signaling is Penpal RPC supplied by probe.js.
// No public STUN/TURN servers or raw SDP/candidate addresses in exported results.
export function createMediaProbe({ callLeaf, callParent, getRemote }) {
  const sessions = new Map();
  let source;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const error = (e) => ({ name: e.name, message: e.message });
  async function bounded(promise, label, ms = 12000) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function attempt(fn) {
    try { return { ok: true, value: await fn() }; }
    catch (e) { return { ok: false, error: error(e) }; }
  }
  function display(stream) {
    const v = document.createElement("video");
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "display:block;width:240px;height:180px;object-fit:contain";
    v.srcObject = stream;
    document.body.prepend(v);
    return v;
  }
  function tracks(stream) {
    return stream?.getTracks().map((t) => ({
      native: t instanceof MediaStreamTrack, kind: t.kind,
      readyState: t.readyState, muted: t.muted, enabled: t.enabled,
    })) ?? [];
  }
  async function stopSource() {
    if (!source) return;
    source.stream.getTracks().forEach((t) => t.stop());
    clearInterval(source.timer);
    source.oscillator?.stop();
    await source.audio?.close();
    source.video.remove();
    source.canvas?.remove();
    source = undefined;
  }
  async function prepare(kind = "synthetic") {
    await stopSource();
    if (kind === "camera") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      source = { kind, stream, video: display(stream) };
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const draw = () => {
        ctx.fillStyle = `hsl(${frame++ * 7 % 360} 80% 50%)`;
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = "black"; ctx.font = "32px sans-serif";
        ctx.fillText(String(frame), 30, 80);
      };
      draw();
      const stream = canvas.captureStream(15);
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination); // Never connect to speakers.
      oscillator.start();
      destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      source = { kind, stream, audio, oscillator, canvas, timer: setInterval(draw, 67), video: display(stream) };
      await bounded(audio.resume(), "Synthetic AudioContext resume");
    }
    const playback = await attempt(() => bounded(source.video.play(), "Host preview"));
    return { kind, playback, tracks: tracks(source.stream), audioContext: source.audio?.state };
  }
  function makePeer(id, send) {
    const state = { id, pc: new RTCPeerConnection({ iceServers: [] }),
      stream: new MediaStream(), events: [], candidates: [], pending: [],
      started: performance.now(), send };
    const log = (type, detail) => state.events.push({ ms: Math.round(performance.now() - state.started), type, detail });
    for (const name of ["connectionstatechange", "iceconnectionstatechange", "icegatheringstatechange", "signalingstatechange"]) {
      state.pc.addEventListener(name, () => log(name, {
        connection: state.pc.connectionState, ice: state.pc.iceConnectionState,
        gathering: state.pc.iceGatheringState, signaling: state.pc.signalingState,
      }));
    }
    state.pc.onicecandidate = ({ candidate }) => {
      if (candidate) state.candidates.push({ type: candidate.type, protocol: candidate.protocol });
      log("candidate", candidate ? { type: candidate.type, protocol: candidate.protocol } : "complete");
      void state.send(candidate?.toJSON() ?? null).catch((e) => log("signalError", error(e)));
    };
    state.pc.onicecandidateerror = (e) => log("icecandidateerror", { code: e.errorCode });
    state.pc.ontrack = ({ track }) => {
      state.stream.addTrack(track);
      log("track", { kind: track.kind });
      for (const type of ["mute", "unmute", "ended"]) track.addEventListener(type, () => log(type, { kind: track.kind }));
    };
    sessions.set(id, state);
    return state;
  }
  async function acceptCandidate(id, candidate) {
    const state = sessions.get(id);
    if (!state) return callParent("mediaCandidate", [id, candidate]);
    if (!state.pc.remoteDescription) state.pending.push(candidate);
    else await state.pc.addIceCandidate(candidate);
  }
  async function remoteDescription(state, description) {
    await state.pc.setRemoteDescription(description);
    for (const candidate of state.pending.splice(0)) await state.pc.addIceCandidate(candidate);
  }
  async function answer(id, description) {
    const state = makePeer(id, (candidate) => callParent("mediaCandidate", [id, candidate]));
    await remoteDescription(state, description);
    await state.pc.setLocalDescription(await state.pc.createAnswer());
    state.video = display(state.stream);
    // Return immediately. Candidates continue over RPC in both directions.
    return state.pc.localDescription.toJSON();
  }
  async function snapshot(id) {
    const s = sessions.get(id);
    if (!s) return { missing: true };
    const stats = [];
    if (s.pc) {
      for (const item of (await s.pc.getStats()).values()) {
        if (["inbound-rtp", "outbound-rtp"].includes(item.type)) {
          const row = {};
          for (const key of ["type", "kind", "mediaType", "packetsReceived", "packetsSent", "bytesReceived", "bytesSent", "framesDecoded", "framesEncoded", "totalSamplesReceived", "totalAudioEnergy"]) {
            if (item[key] !== undefined) row[key] = item[key];
          }
          stats.push(row);
        } else if (item.type === "candidate-pair") {
          stats.push({ type: item.type, state: item.state, nominated: item.nominated,
            bytesSent: item.bytesSent, bytesReceived: item.bytesReceived });
        }
      }
    }
    const v = s.video;
    return {
      connection: s.pc?.connectionState, ice: s.pc?.iceConnectionState,
      gathering: s.pc?.iceGatheringState, signaling: s.pc?.signalingState,
      tracks: tracks(s.stream), clonedTracks: tracks(s.clone), stats,
      candidates: s.candidates, events: s.events,
      video: v && { width: v.videoWidth, height: v.videoHeight, readyState: v.readyState,
        paused: v.paused, currentTime: v.currentTime,
        decodedFrames: v.getVideoPlaybackQuality?.().totalVideoFrames },
      visible: document.visibilityState, secure: isSecureContext, origin: window.origin,
    };
  }
  async function consumers(id) {
    const s = sessions.get(id);
    const result = {};
    const playback = attempt(() => bounded(s.video.play(), "video.play"));
    const frame = attempt(() => bounded(new Promise((resolve) => {
      const check = () => {
        if (s.video.videoWidth > 0 && s.video.currentTime > 0) resolve({ width: s.video.videoWidth, height: s.video.videoHeight });
      };
      s.frameTimer = setInterval(check, 100);
      check();
    }), "Decoded video"));
    [result.playback, result.frame] = await Promise.all([playback, frame]);
    clearInterval(s.frameTimer);
    if (result.frame.ok) {
      result.recording = await attempt(() => bounded(new Promise((resolve, reject) => {
        const recorder = new MediaRecorder(s.stream);
        s.recorder = recorder;
        const chunks = [];
        recorder.ondataavailable = ({ data }) => chunks.push(data);
        recorder.onerror = (e) => reject(e.error ?? e);
        recorder.onstop = () => {
          const bytes = new Blob(chunks).size;
          if (!bytes) reject(new Error("MediaRecorder produced no bytes"));
          else resolve({ bytes, mimeType: recorder.mimeType });
        };
        recorder.start();
        s.recordTimer = setTimeout(() => recorder.stop(), 500);
      }), "MediaRecorder"));
      result.webAudio = await attempt(async () => {
        const audio = new AudioContext();
        try {
          const node = audio.createMediaStreamSource(s.stream);
          node.disconnect();
          return { accepted: true, contextState: audio.state };
        } finally { await audio.close(); }
      });
      result.onward = await attempt(() => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        try { return { senders: s.stream.getTracks().map((t) => pc.addTrack(t, s.stream)).length }; }
        finally { pc.close(); }
      });
    }
    result.snapshot = await snapshot(id);
    return result;
  }
  function close(id) {
    const s = sessions.get(id);
    if (!s) return;
    s.pc?.close();
    if (s.recorder && s.recorder.state !== "inactive") s.recorder.stop();
    clearTimeout(s.recordTimer); clearInterval(s.frameTimer);
    s.stream.getTracks().forEach((t) => t.stop());
    s.clone?.getTracks().forEach((t) => t.stop());
    s.video?.remove();
    sessions.delete(id);
  }
  async function run(path) {
    if (!source) throw new Error("Prepare a media source first");
    const id = crypto.randomUUID();
    const send = (method, ...args) => bounded(callLeaf(path, method, args), method, 35000);
    const queued = [];
    let receiverReady = false;
    const host = makePeer(id, async (candidate) => {
      if (receiverReady) await send("mediaCandidate", id, candidate);
      else queued.push(candidate);
    });
    let stage = "offer";
    const result = { source: source.kind, signaling: "trickle ICE; no STUN/TURN" };
    try {
      source.stream.getTracks().forEach((t) => host.pc.addTrack(t, source.stream));
      await host.pc.setLocalDescription(await host.pc.createOffer());
      stage = "answer";
      const description = await send("mediaAnswer", id, host.pc.localDescription.toJSON());
      receiverReady = true;
      await remoteDescription(host, description);
      for (const candidate of queued.splice(0)) await send("mediaCandidate", id, candidate);
      stage = "consumers";
      result.consumers = await send("mediaConsumers", id);
      result.host = await snapshot(id);
      result.ok = ["playback", "frame", "recording", "webAudio", "onward"].every((key) => result.consumers[key]?.ok) && result.consumers.snapshot.stats.some((s) =>
        (s.kind ?? s.mediaType) === "audio" && s.bytesReceived > 0);
      stage = "host stop";
      host.pc.close(); // Stop transmission independently of child cooperation.
      await delay(500);
      const before = await send("mediaSnapshot", id);
      await delay(500);
      const after = await send("mediaSnapshot", id);
      const bytes = (s) => s.stats.filter((s) => s.type === "inbound-rtp").map(({ kind, mediaType, bytesReceived }) => ({ kind: kind ?? mediaType, bytesReceived })).sort((a, b) => a.kind.localeCompare(b.kind));
      const hadMedia = bytes(before).some((s) => s.bytesReceived > 0);
      result.hostStop = { before: bytes(before), after: bytes(after),
        hadMedia, noMoreBytes: hadMedia && JSON.stringify(bytes(before)) === JSON.stringify(bytes(after)) };
    } catch (e) {
      result.ok = false;
      result.failure = { stage, ...error(e) };
      result.host = await snapshot(id);
      result.receiver = await attempt(() => send("mediaSnapshot", id));
    } finally {
      close(id);
      await attempt(() => send("mediaClose", id));
    }
    return result;
  }
  function receiveTracks(id, received) {
    const validation = received.map((t) => ({ native: t instanceof MediaStreamTrack,
      kind: t?.kind, constructor: t?.constructor?.name }));
    if (!validation.every((t) => t.native)) return { accepted: false, validation };
    const stream = new MediaStream(received);
    sessions.set(id, { id, stream, clone: stream.clone(), video: display(stream), events: [], candidates: [] });
    return { accepted: true, validation };
  }
  async function direct(path, transferOptions) {
    if (!source) throw new Error("Prepare a media source first");
    const id = crypto.randomUUID();
    const clones = source.stream.getTracks().map((t) => t.clone());
    const result = {};
    try {
      const remote = getRemote(path[0]);
      result.received = await attempt(() => bounded(remote.mediaReceiveTracks(id, clones, transferOptions(clones)), "Direct track transfer"));
      result.senderAfterTransfer = tracks(new MediaStream(clones));
      if (result.received.ok && result.received.value.accepted) {
        result.consumers = await bounded(remote.mediaConsumers(id), "Direct track consumers", 30000);
        // Stopping a host-side original may leave receiver-owned clones alive.
        source.stream.getTracks().forEach((t) => t.stop());
        await delay(500);
        result.afterOriginalsStopped = await remote.mediaSnapshot(id);
      }
    } finally {
      clones.forEach((t) => t.stop());
      await attempt(() => callLeaf(path, "mediaClose", [id]));
    }
    return result;
  }
  return { prepare, stopSource, run, direct, methods: {
    mediaAnswer: answer, mediaCandidate: acceptCandidate, mediaSnapshot: snapshot,
    mediaConsumers: consumers, mediaClose: close, mediaReceiveTracks: receiveTracks,
  } };
}
