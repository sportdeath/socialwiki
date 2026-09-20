// Test-only banner injected before the real kernel in every document realm.
(() => {
  const config = window.mediaDiagnosticConfig;
  if (!config) return;
  const frame = window === window.top ? "host" : `frame-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
  const log = (event, detail = {}) => window.top.postMessage({ mediaDiagnostic: true,
    frame, at: Date.now(), event, detail }, "*");
  window.mediaDiagnosticLog = log;
  // Native error messages can contain SDP/candidate addresses. Export names only.
  const errorInfo = (error) => ({ name: error?.name });
  const addressClass = (address = "") => !address ? "absent" : address.endsWith(".local") ? "mdns"
    : address.includes(":") ? "ipv6" : /^\d+\.\d+\.\d+\.\d+$/.test(address) ? "ipv4" : "other";
  const candidateInfo = (candidate) => {
    if (!candidate || candidate.candidate === "") return { end: true };
    const words = candidate.candidate?.split(" ") ?? [];
    return { type: candidate.type ?? candidate.candidateType ?? words[7],
      protocol: candidate.protocol ?? words[2], addressClass: addressClass(candidate.address ?? words[4]),
      component: candidate.component, tcpType: candidate.tcpType, sdpMid: candidate.sdpMid };
  };
  const descriptionInfo = (description) => ({ type: description?.type,
    // Deliberately exclude addresses, ICE credentials, fingerprints, SSRCs and track IDs.
    media: description?.sdp?.split(/\r?\n/).filter((line) =>
      /^(m=|a=(sendonly|recvonly|sendrecv|inactive|setup:|rtpmap:|ice-options:))/.test(line))
      .map((line) => line.startsWith("m=") ? line.replace(/^(m=\w+) \d+ /, "$1 [port] ") : line),
    candidateCount: (description?.sdp?.match(/^a=candidate:/gm) ?? []).length,
    endOfCandidates: description?.sdp?.includes("a=end-of-candidates") ?? false,
  });
  if (window === window.top) {
    const report = window.mediaDiagnosticReport = { version: 1, variant: config.variant,
      depth: config.depth, kernelSha256: config.kernelSha256, userAgent: navigator.userAgent,
      createdAt: new Date().toISOString(), entries: [] };
    window.addEventListener("message", ({ data }) => {
      if (data?.mediaDiagnostic !== true) return;
      report.entries.push(data);
      const status = document.getElementById("diagnostic-status");
      if (status) status.textContent = `${report.entries.length} events · ${data.frame}: ${data.event}`;
    });
    // init.ts replaces the host DOM during DOMContentLoaded. Mount afterwards.
    window.addEventListener("DOMContentLoaded", () => setTimeout(() => {
      const panel = document.createElement("div");
      panel.style.cssText = "position:fixed;bottom:0;left:0;right:0;padding:12px;background:#eee;color:#111;border-top:1px solid #888;z-index:10000;font:14px system-ui";
      panel.innerHTML = `<strong>Media diagnostic: ${config.variant}</strong>
        <p>Download before changing variants. Keep this tab visible.</p>
        <button id="diagnostic-download">Download report</button>
        <span id="diagnostic-status">Ready</span><p id="diagnostic-variants"></p>`;
      for (const variant of ["baseline", "add-track", "gather-first"]) {
        const link = document.createElement("a");
        link.href = `/?variant=${variant}&depth=${config.depth}`;
        link.textContent = variant;
        link.style.marginRight = "18px";
        panel.querySelector("#diagnostic-variants").append(link);
      }
      panel.querySelector("button").onclick = async () => {
        // Give pending getStats snapshots time to reach the host report.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = `media-diagnostic-${config.variant}-depth${config.depth}.json`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      document.body.append(panel);
    }, 0), { once: true });
    const native = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    if (native) navigator.mediaDevices.getUserMedia = async (constraints) => {
      log("native-capture-request", { audio: Boolean(constraints.audio), video: Boolean(constraints.video) });
      try {
        const stream = await native(constraints);
        log("native-capture-resolved", { tracks: stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState, muted: track.muted })) });
        return stream;
      } catch (error) { log("native-capture-rejected", errorInfo(error)); throw error; }
    };
  }
  log("realm-ready", { top: window === window.top, secure: isSecureContext,
    originOpaque: window.origin === "null", protocol: location.protocol });
  const NativePeer = window.RTCPeerConnection;
  if (!NativePeer) { log("webrtc-unavailable"); return; }
  let nextPeer = 0;
  window.RTCPeerConnection = new Proxy(NativePeer, {
    construct(Target, args) {
      const pc = new Target(...args);
      const id = ++nextPeer;
      const emit = (event, detail = {}) => log(event, { peer: id, ...detail });
      const state = () => ({ connection: pc.connectionState, ice: pc.iceConnectionState,
        gathering: pc.iceGatheringState, signaling: pc.signalingState });
      let closed = false;
      let sampling = false;
      async function snapshot(reason) {
        if (sampling) return;
        sampling = true;
        try {
          const stats = await pc.getStats();
          const rows = [];
          for (const stat of stats.values()) {
            if (!["inbound-rtp", "outbound-rtp", "transport", "candidate-pair"].includes(stat.type)) continue;
            const row = {};
            for (const key of ["type", "kind", "mediaType", "state", "nominated", "dtlsState", "iceState",
              "bytesReceived", "bytesSent", "packetsReceived", "packetsSent", "framesDecoded", "framesEncoded",
              "requestsSent", "requestsReceived", "responsesSent", "responsesReceived"]) {
              if (stat[key] !== undefined) row[key] = stat[key];
            }
            if (stat.type === "candidate-pair") {
              row.local = candidateInfo(stats.get(stat.localCandidateId));
              row.remote = candidateInfo(stats.get(stat.remoteCandidateId));
            }
            rows.push(row);
          }
          emit("stats", { reason, ...state(), rows });
        } catch (error) { emit("stats-unavailable", { reason, ...errorInfo(error) }); }
        finally { sampling = false; }
      }
      emit("peer-created", state());
      for (const event of ["connectionstatechange", "iceconnectionstatechange", "icegatheringstatechange", "signalingstatechange"]) {
        pc.addEventListener(event, () => { emit(event, state()); if (!closed) void snapshot(event); });
      }
      pc.addEventListener("icecandidate", ({ candidate }) => emit("local-candidate", candidateInfo(candidate)));
      pc.addEventListener("icecandidateerror", (event) => emit("candidate-error", { code: event.errorCode }));
      pc.addEventListener("track", ({ track }) => {
        emit("track", { kind: track.kind, muted: track.muted, readyState: track.readyState });
        for (const event of ["mute", "unmute", "ended"]) track.addEventListener(event, () => emit(`track-${event}`, { kind: track.kind }));
      });
      for (const method of ["setRemoteDescription", "addIceCandidate"]) {
        const native = pc[method].bind(pc);
        pc[method] = async (value) => {
          emit(`${method}-start`, method === "addIceCandidate" ? candidateInfo(value) : descriptionInfo(value));
          try { const result = await native(value); emit(`${method}-done`, state()); return result; }
          catch (error) { emit(`${method}-error`, errorInfo(error)); throw error; }
        };
      }
      const setLocal = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = async (description) => {
        emit("setLocalDescription-start", descriptionInfo(description));
        try {
          await setLocal(description);
          if (config.variant === "gather-first" && pc.iceGatheringState !== "complete") {
            await new Promise((resolve, reject) => {
              const finish = () => {
                clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", changed);
              };
              const changed = () => { if (pc.iceGatheringState === "complete") { finish(); resolve(); } };
              const timer = setTimeout(() => { finish(); reject(new Error("ICE gathering exceeded 20 seconds")); }, 20000);
              pc.addEventListener("icegatheringstatechange", changed);
              changed();
            });
          }
          emit("setLocalDescription-done", { ...descriptionInfo(pc.localDescription), ...state() });
        } catch (error) { emit("setLocalDescription-error", errorInfo(error)); throw error; }
      };
      if (config.variant === "gather-first") {
        // Suppress only the adapter's trickle handler. Diagnostic listeners still run.
        Object.defineProperty(pc, "onicecandidate", { configurable: true, get: () => null, set() {} });
      }
      if (config.variant === "add-track") {
        const addTransceiver = pc.addTransceiver.bind(pc);
        pc.addTransceiver = (track, options) => {
          if (!(track instanceof MediaStreamTrack)) return addTransceiver(track, options);
          emit("variant-addTrack", { kind: track.kind });
          const sender = pc.addTrack(track, ...(options?.streams ?? []));
          return pc.getTransceivers().find((transceiver) => transceiver.sender === sender);
        };
      }
      const interval = setInterval(() => { if (!closed) void snapshot("interval"); }, 1000);
      const close = pc.close.bind(pc);
      pc.close = () => {
        emit("close-request", state());
        void snapshot("before-close");
        closed = true; clearInterval(interval); close();
      };
      return pc;
    },
  });
})();
