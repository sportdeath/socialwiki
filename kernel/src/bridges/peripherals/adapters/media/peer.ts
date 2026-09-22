import type { MediaSignal } from "./shared";

/** Native WebRTC carries media directly between host and leaf; Penpal carries signals. */
export function createMediaPeer(send: (signal: MediaSignal) => Promise<unknown>, fail: (error: unknown) => void) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const candidates: (RTCIceCandidateInit | null)[] = [];
  let queue = Promise.resolve();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => fail(new DOMException(
      "The local media connection could not connect. Check the browser's WebRTC policy.", "NotReadableError")), ms);
  };
  deadline(30000);
  pc.onicecandidate = ({ candidate }) => {
    if (!closed) void send({ type: "candidate", candidate: candidate?.toJSON() ?? null }).catch(fail);
  };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "connected") clearTimeout(timer);
    else if (pc.connectionState === "disconnected") deadline(10000);
    else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      fail(new DOMException("The local media connection ended.", "NotReadableError"));
    }
  };
  return {
    pc,
    // Serialize SDP/ICE application; candidates may arrive before the description.
    receive(signal: MediaSignal) {
      queue = queue.then(async () => {
        if (closed) return;
        if (signal.type === "description") {
          await pc.setRemoteDescription(signal.description);
          for (const candidate of candidates.splice(0)) await pc.addIceCandidate(candidate ?? undefined);
        } else if (signal.type === "candidate") {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate ?? undefined);
          else candidates.push(signal.candidate);
        } else throw new TypeError("Unknown media signal.");
      });
      return queue;
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
    },
  };
}
