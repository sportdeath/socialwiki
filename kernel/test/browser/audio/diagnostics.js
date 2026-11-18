// Observers for this manual fixture only. Level probes use the existing contexts;
// they do not open microphones, play audio, or change the bridge protocol.
(() => {
  const probes = document.currentScript?.dataset.audioProbes === "true";
  window.audioTestProbes = probes;
  let depth = 0;
  for (let frame = window; frame !== frame.top; frame = frame.parent) depth++;
  const report = (event, detail = {}) => window.top.postMessage({
    audioTest: "event", event, detail, depth, time: Date.now(),
  }, "*");
  window.audioTestLog = report;
  if (window === window.top) {
    const entries = [];
    const subscribers = new Set();
    addEventListener("message", ({ data, source }) => {
      if (data?.audioTest === "subscribe") {
        subscribers.add(source);
        source.postMessage({ audioTest: "history", entries }, "*");
      }
      if (data?.audioTest !== "event") return;
      entries.push(data);
      if (entries.length > 500) entries.shift();
      for (const subscriber of subscribers) {
        if (subscriber.closed) subscribers.delete(subscriber);
        else subscriber.postMessage({ audioTest: "entry", entry: data }, "*");
      }
    });
  }
  report("frame loaded", { browser: navigator.userAgent, secureContext: isSecureContext, origin: self.origin, probes,
    videoSupport: { bitmap: typeof createImageBitmap === "function", canvas: typeof HTMLCanvasElement.prototype.captureStream === "function",
      frameCallback: typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function" } });
  addEventListener("error", event => report("script error", { message: event.message }));
  addEventListener("unhandledrejection", event => report("unhandled rejection", { message: String(event.reason) }));
  addEventListener("visibilitychange", () => report("visibility", { state: document.visibilityState }));
  addEventListener("pagehide", () => report("page hidden"));

  let nextContext = 0;
  const contexts = new WeakMap();
  function observeSamples(node, stage, track) {
    const context = node.context;
    const info = contexts.get(context);
    if (!info) return;
    if (track) info.source = track;
    if (probes) {
      const analyser = context.createAnalyser();
      // AnalyserNode can inspect a branch without connecting it to an output.
      node.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      info.probes.push({ stage, analyser, samples, track });
    }
    // Keep clock logging in both modes, including when no extra nodes are added.
    if (info.timer) return;
    info.timer = setInterval(() => {
      report("audio samples", {
        id: info.id, state: context.state, contextTime: context.currentTime,
        ...(info.source ? { source: { enabled: info.source.enabled, muted: info.source.muted,
          readyState: info.source.readyState } } : {}),
        probes: info.probes.map(({ stage, analyser, samples, track }) => {
          analyser.getFloatTimeDomainData(samples);
          let squareSum = 0, peak = 0;
          for (const sample of samples) { squareSum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
          return { stage, rms: Math.sqrt(squareSum / samples.length), peak,
            ...(track ? { enabled: track.enabled, muted: track.muted, readyState: track.readyState } : {}) };
        }),
      });
    }, 1000);
  }
  if (window.AudioContext) window.AudioContext = new Proxy(window.AudioContext, {
    construct(target, args) {
      const context = new target(...args);
      const id = ++nextContext;
      const info = { id, probes: [], timer: undefined };
      contexts.set(context, info);
      report("AudioContext created", { id, state: context.state, sampleRate: context.sampleRate });
      context.addEventListener("statechange", () => {
        report("AudioContext state", { id, state: context.state });
        if (context.state === "closed") clearInterval(info.timer);
      });
      if (window === window.top) {
        const createSource = context.createMediaStreamSource.bind(context);
        context.createMediaStreamSource = stream => {
          const node = createSource(stream);
          observeSamples(node, "native microphone input", stream.getAudioTracks()[0]);
          return node;
        };
      }
      if (context.audioWorklet) {
        const addModule = context.audioWorklet.addModule.bind(context.audioWorklet);
        context.audioWorklet.addModule = (...args) => {
          report("worklet module loading", { id, scheme: new URL(args[0], document.baseURI).protocol });
          return addModule(...args).then(value => {
            report("worklet module loaded", { id }); return value;
          }, error => { report("worklet module failed", { id, name: error.name, message: error.message }); throw error; });
        };
      }
      return context;
    },
  });
  if (window.AudioWorkletNode) window.AudioWorkletNode = new Proxy(window.AudioWorkletNode, {
    construct(target, args) {
      const node = new target(...args);
      report("AudioWorkletNode created", { name: args[1] });
      if (args[1] === "socialwiki-audio-receive") observeSamples(node, "bridge receiver output");
      node.addEventListener("processorerror", () => report("audio processor error", { name: args[1] }));
      return node;
    },
  });
  if (window.RTCPeerConnection) window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
    construct(target, args) {
      report("UNEXPECTED WebRTC connection", { note: "Local media delivery should not create this." });
      return new target(...args);
    },
  });
  if (window === window.top && navigator.mediaDevices?.getUserMedia) {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      report("native capture requested", { constraints });
      try {
        const stream = await capture(constraints);
        report("native capture opened", { tracks: stream.getTracks().map(track => ({
          kind: track.kind, muted: track.muted, sampleRate: track.getSettings().sampleRate,
          channelCount: track.getSettings().channelCount, width: track.getSettings().width,
          height: track.getSettings().height, frameRate: track.getSettings().frameRate, facingMode: track.getSettings().facingMode,
        })) });
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => { report("native track stopped", { kind: track.kind }); stop(); };
          for (const type of ["ended", "mute", "unmute"]) {
            track.addEventListener(type, () => report(`native track ${type}`, { kind: track.kind }));
          }
        }
        return stream;
      } catch (error) { report("native capture failed", { name: error.name, message: error.message }); throw error; }
    };
  }
  // Count transfers without reading pixels or attaching another media consumer.
  const post = MessagePort.prototype.postMessage;
  let frames = 0, lastReport = performance.now();
  MessagePort.prototype.postMessage = function (data, ...args) {
    const bitmap = typeof ImageBitmap === "function" && data instanceof ImageBitmap;
    const width = bitmap ? data.width : undefined, height = bitmap ? data.height : undefined;
    const result = post.call(this, data, ...args);
    if (bitmap) {
      frames++;
      const now = performance.now();
      if (now - lastReport >= 1000) {
        report("video frames sent", { frames, fps: frames * 1000 / (now - lastReport), width, height });
        frames = 0; lastReport = now;
      }
    }
    return result;
  };
})();
