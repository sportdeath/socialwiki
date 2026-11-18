import type { PeripheralSession, PeripheralsService } from "../../shared";
import { createAudioEndpoint, receiveAudio } from "./audio";
import { createVideoReceiver } from "./video";
import { createTrackGroup } from "./tracks";
import { mediaException, mediaKinds, type MediaEvent, type MediaKind, type TrackInfo } from "./shared";

/** One authorized capture, with independent local audio and video transports. */
export function captureMedia(service: Pick<PeripheralsService, "start">, constraints: MediaStreamConstraints) {
  return new Promise<MediaStream>((resolve, reject) => {
    const stream = new MediaStream();
    const groups = new Map<MediaKind, ReturnType<typeof createTrackGroup>>();
    const receivers = new Map<MediaKind, { stop(): void }>();
    const waiting = new Set(mediaKinds.filter((kind) => constraints[kind]));
    let audio: ReturnType<typeof createAudioEndpoint> | undefined;
    let session: PeripheralSession | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let delivered = false;
    function finish(error: unknown = new DOMException("Media capture ended.", "AbortError")) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      window.removeEventListener("pagehide", onPageHide);
      groups.forEach((group) => group.end());
      receivers.forEach((receiver) => receiver.stop());
      audio?.stop();
      session?.stop();
      if (!delivered) reject(error);
    }
    const onPageHide = () => finish();
    window.addEventListener("pagehide", onPageHide, { once: true });
    const send = async (command: unknown) => {
      if (closed || !session?.send) throw new Error("Media request is unavailable.");
      return session.send(command);
    };
    const received = (info: TrackInfo, track: MediaStreamTrack) => {
      if (closed || !receivers.has(info.kind)) { track.stop(); return; }
      groups.get(info.kind)!.add(track);
      stream.addTrack(track);
      waiting.delete(info.kind);
      if (!waiting.size) {
        delivered = true;
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
        if (signal.type === "trackState") { groups.get(signal.track.kind)?.update(signal.track); return; }
        if (signal.type === "trackEnded") {
          if (!delivered) { finish(); return; }
          groups.get(signal.kind)?.end();
          receivers.get(signal.kind)?.stop();
          receivers.delete(signal.kind);
          return;
        }
        try {
          const kind = signal.track.kind;
          if (!waiting.has(kind) || receivers.has(kind)) throw new TypeError("Unexpected media transport.");
          groups.set(kind, createTrackGroup(signal.track, send, finish));
          // The native permission prompt has no deadline; delivery does once capture is open.
          timer ??= setTimeout(() => finish(new DOMException(
            `Local ${[...waiting].join(" and ")} delivery did not start.`, "NotReadableError")), 15000);
          if (signal.type === "audio" && audio) {
            const endpoint = audio;
            receivers.set(kind, { stop() { signal.port.close(); endpoint.stop(); } });
            void receiveAudio(endpoint, signal.port, signal.channels).then((track) => received(signal.track, track)).catch(finish);
          } else if (signal.type === "video") {
            const receiver = createVideoReceiver(signal.port, signal.track, finish);
            receivers.set(kind, receiver);
            void receiver.ready.then((track) => received(signal.track, track)).catch(finish);
          } else throw new TypeError("Unexpected media transport.");
        } catch (error) { signal.port.close(); finish(error); }
      });
    } catch (error) { finish(error); }
  });
}
