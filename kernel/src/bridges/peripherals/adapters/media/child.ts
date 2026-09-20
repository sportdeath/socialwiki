import type { PeripheralSession, PeripheralsService } from "../../shared";
import { createDeviceListing } from "./devices";
import { createMediaPeer } from "./peer";
import { createTrackGroup } from "./tracks";
import { mediaException, mediaKinds, normalizeConstraints, type MediaEvent, type MediaKind } from "./shared";

export function installMediaAdapter(service: PeripheralsService) {
  if (!service.features.media) return;
  // Do not retain native methods that would operate on the opaque iframe.
  const devices = new EventTarget();
  Object.defineProperty(devices, "getSupportedConstraints", { configurable: true,
    value: () => structuredClone(service.features.media!) });
  if (service.features.enumerateDevices) {
    const listing = createDeviceListing(service, devices);
    Object.defineProperty(devices, "enumerateDevices", { value: listing.enumerateDevices });
    const add = devices.addEventListener.bind(devices);
    devices.addEventListener = (type, callback, options) => {
      if (type === "devicechange") listing.watch();
      add(type, callback, options);
    };
    let onchange: EventListener | null = null;
    Object.defineProperty(devices, "ondevicechange", { configurable: true,
      get: () => onchange,
      set(value: EventListener | null) {
        if (onchange) devices.removeEventListener("devicechange", onchange);
        onchange = typeof value === "function" ? value : null;
        if (onchange) devices.addEventListener("devicechange", onchange);
      } });
  }
  Object.defineProperty(devices, "getUserMedia", { configurable: true, writable: true,
    value: createGetUserMedia(service) });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, enumerable: true, value: devices });
}

export function createGetUserMedia(service: Pick<PeripheralsService, "start">): MediaDevices["getUserMedia"] {
  return async (options = {}) => {
    const constraints = normalizeConstraints(options);
    const kinds = mediaKinds.filter((kind) => constraints[kind]);
    return new Promise<MediaStream>((resolve, reject) => {
      const stream = new MediaStream();
      const groups = new Map<MediaKind, ReturnType<typeof createTrackGroup>>();
      let session: PeripheralSession;
      let peer: ReturnType<typeof createMediaPeer> | undefined;
      let closed = false;
      let delivered = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const send = async (message: unknown) => {
        if (closed || !session.send) throw new Error("Media request is unavailable.");
        return session.send(message);
      };
      function finish(error: unknown = new DOMException("Media capture ended.", "AbortError")) {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        window.removeEventListener("pagehide", onPageHide);
        peer?.close();
        groups.forEach((group) => group.end());
        session?.stop();
        if (!delivered) reject(error);
      }
      const onPageHide = () => finish();
      window.addEventListener("pagehide", onPageHide, { once: true });
      const ready = () => {
        if (!closed && !delivered && peer?.pc.connectionState === "connected" &&
          kinds.every((kind) => stream.getTracks().some((track) => track.kind === kind && !track.muted))) {
          delivered = true;
          clearTimeout(timer);
          resolve(stream);
        }
      };
      let queue = Promise.resolve();
      try {
        session = service.start({ source: [], capability: "media", method: "getUserMedia", args: [constraints] }, (event) => {
          if (closed) return;
          if (event.type !== "data") {
            finish(event.type === "error" ? mediaException(event) : undefined);
            return;
          }
          queue = queue.then(async () => {
            if (closed) return;
            const signal = event.value as MediaEvent;
            if (signal.type === "trackState") { groups.get(signal.track.kind)?.update(signal.track); return; }
            if (signal.type === "trackEnded") { groups.get(signal.kind)?.end(); return; }
            // A candidate can precede the offer, so create the receiver on the first signal.
            if (!peer) {
              peer = createMediaPeer(send, finish);
              timer = setTimeout(() => finish(new DOMException(
                "The local connection did not deliver the requested media.", "NotReadableError")), 30000);
              peer.pc.addEventListener("connectionstatechange", ready);
              peer.pc.ontrack = ({ track }) => {
                const group = groups.get(track.kind as MediaKind);
                if (!group) { track.stop(); finish(new Error("Unexpected media track.")); return; }
                group.add(track);
                stream.addTrack(track);
                track.addEventListener("unmute", ready);
                ready();
              };
            }
            if (signal.type === "description") {
              if (signal.description.type !== "offer" || !signal.tracks) throw new TypeError("Expected a media offer.");
              for (const info of signal.tracks) groups.set(info.kind, createTrackGroup(info, send, finish));
            }
            await peer.receive(signal);
            if (closed) return;
            if (signal.type === "description") {
              await peer.pc.setLocalDescription(await peer.pc.createAnswer());
              if (!closed) await send({ type: "description", description: peer.pc.localDescription!.toJSON() });
            }
            ready();
          }).catch(finish);
        });
      } catch (error) { finish(error); }
    });
  };
}
