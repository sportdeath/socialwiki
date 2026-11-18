import type { PeripheralSession, PeripheralsService } from "../../shared";
import { createAudioEndpoint, receiveAudio } from "./audio";
import { createVideoReceiver } from "./video";
import { createTrackGroup } from "./tracks";
import { mediaException, mediaKinds, type MediaEvent, type MediaKind } from "./shared";

/** One authorized capture, with independent local audio and video transports. */
export function captureMedia(service: Pick<PeripheralsService, "start">, constraints: MediaStreamConstraints) {
  return new Promise<MediaStream>((resolve, reject) => {
    const stream = new MediaStream();
    const receivers = new Map<MediaKind, { group: ReturnType<typeof createTrackGroup>; stop(): void }>();
    const waiting = new Set(mediaKinds.filter((kind) => constraints[kind]));
    let audio: ReturnType<typeof createAudioEndpoint> | undefined;
    let session: PeripheralSession | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    function finish(error: unknown = new DOMException("Media capture ended.", "AbortError")) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      window.removeEventListener("pagehide", onPageHide);
      receivers.forEach(({ group, stop }) => { group.end(); stop(); });
      receivers.clear();
      audio?.stop();
      session?.stop();
      reject(error); // Harmless if capture already resolved.
    }
    const onPageHide = () => finish();
    window.addEventListener("pagehide", onPageHide, { once: true });
    const send = async (command: unknown) => {
      if (closed || !session?.send) throw new Error("Media request is unavailable.");
      return session.send(command);
    };
    const received = (kind: MediaKind, track: MediaStreamTrack) => {
      const receiver = receivers.get(kind);
      if (closed || !receiver) { track.stop(); return; }
      receiver.group.add(track);
      stream.addTrack(track);
      waiting.delete(kind);
      if (!waiting.size) {
        clearTimeout(timer);
        resolve(stream);
      }
    };
    try {
      // Start the receiving audio context during the original click/tap, before any awaits.
      if (constraints.audio) audio = createAudioEndpoint(finish);
      session = service.start({ source: [], capability: "media", method: "getUserMedia", args: [constraints] }, (event) => {
        if (closed) return;
        if (event.type !== "data") { finish(event.type === "error" ? mediaException(event) : undefined); return; }
        const signal = event.value as MediaEvent;
        if (signal.type === "trackState") { receivers.get(signal.track.kind)?.group.update(signal.track); return; }
        if (signal.type === "trackEnded") {
          if (waiting.size) { finish(); return; }
          const receiver = receivers.get(signal.kind);
          receiver?.group.end();
          receiver?.stop();
          receivers.delete(signal.kind);
          return;
        }
        try {
          const kind = signal.track.kind;
          if (!waiting.has(kind) || receivers.has(kind)) throw new TypeError("Unexpected media transport.");
          const group = createTrackGroup(signal.track, send, finish);
          // The native permission prompt has no deadline; delivery does once capture is open.
          timer ??= setTimeout(() => finish(new DOMException(
            `Local ${[...waiting].join(" and ")} delivery did not start.`, "NotReadableError")), 15000);
          if (signal.type === "audio" && audio) {
            const endpoint = audio;
            receivers.set(kind, { group, stop() { signal.port.close(); endpoint.stop(); } });
            void receiveAudio(endpoint, signal.port, signal.channels).then((track) => received(kind, track)).catch(finish);
          } else if (signal.type === "video") {
            const receiver = createVideoReceiver(signal.port, signal.track, finish);
            receivers.set(kind, { group, stop: receiver.stop });
            void receiver.ready.then((track) => received(kind, track)).catch(finish);
          } else throw new TypeError("Unexpected media transport.");
        } catch (error) { signal.port.close(); finish(error); }
      });
    } catch (error) { finish(error); }
  });
}
