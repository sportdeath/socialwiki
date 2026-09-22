import type { AdapterContext, PeripheralSession, PeripheralsService, PeripheralSink } from "../../shared";
import { mediaException, serializeMediaError } from "./shared";

type Device = MediaDeviceInfoJSON & { capabilities?: MediaTrackCapabilities };
// lib.dom does not expose a named type for MediaDeviceInfo.toJSON().
type MediaDeviceInfoJSON = { deviceId: string; groupId: string; kind: MediaDeviceKind; label: string };

export function watchMediaDevices(native: MediaDevices, context: AdapterContext,
  watch: boolean, update: PeripheralSink): PeripheralSession {
  let stopped = false;
  let previous = "";
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      if (stopped) return;
      const devices = await native.enumerateDevices();
      if (stopped) return;
      const redacted = new Set<MediaDeviceKind>();
      const values: Device[] = [];
      for (const device of devices) {
        const capability = device.kind === "videoinput" ? "camera" : "microphone";
        const state = context.permissions.state({ source: context.source, capability });
        if (state === "denied") continue;
        if (state !== "granted") {
          // The trusted origin may know labels/IDs from another document's grant.
          // Expose only an anonymous default per kind until this document is allowed.
          if (!redacted.has(device.kind)) values.push({ kind: device.kind, label: "", deviceId: "", groupId: "" });
          redacted.add(device.kind);
        } else {
          const input = device as InputDeviceInfo;
          values.push({ deviceId: device.deviceId, groupId: device.groupId, kind: device.kind, label: device.label,
            ...(input.getCapabilities ? { capabilities: input.getCapabilities() } : {}) });
        }
      }
      const encoded = JSON.stringify(values);
      if (!watch || previous !== encoded) { previous = encoded; update({ type: "data", value: values }); }
      if (!watch) update({ type: "end" });
    }).catch((error) => { if (!stopped) update({ type: "error", ...serializeMediaError(error) }); });
  };
  const unsubscribe = watch ? context.permissions.subscribe(refresh) : () => {};
  if (watch) native.addEventListener("devicechange", refresh);
  refresh();
  return { stop() { stopped = true; unsubscribe(); native.removeEventListener("devicechange", refresh); } };
}

export function createDeviceListing(service: Pick<PeripheralsService, "start">, target: EventTarget) {
  const sessions = new Map<PeripheralSession, (error: Error) => void>();
  let watching = false;
  function start(watch: boolean, receive: (devices: MediaDeviceInfo[]) => void, fail: (error: Error) => void) {
    let session: PeripheralSession;
    session = service.start({ source: [], capability: "media", method: watch ? "watchDevices" : "enumerateDevices", args: [] }, (event) => {
      if (event.type !== "data") {
        sessions.delete(session);
        if (event.type === "error") fail(mediaException(event));
        return;
      }
      receive((event.value as Device[]).map(({ capabilities, ...info }) => ({ ...info, toJSON: () => ({ ...info }),
        ...(info.kind !== "audiooutput" ? { getCapabilities: () => structuredClone(capabilities ?? {}) } : {}) })));
    });
    sessions.set(session, fail);
  }
  window.addEventListener("pagehide", () => {
    for (const [session, fail] of sessions) { session.stop(); fail(new DOMException("Document closed.", "AbortError")); }
    sessions.clear();
  });
  return {
    enumerateDevices: () => new Promise<MediaDeviceInfo[]>((resolve, reject) => start(false, resolve, reject)),
    watch() {
      if (watching) return;
      watching = true;
      let initial = true;
      start(true, () => {
        if (!initial) target.dispatchEvent(new Event("devicechange"));
        initial = false;
      }, () => { watching = false; });
    },
  };
}
