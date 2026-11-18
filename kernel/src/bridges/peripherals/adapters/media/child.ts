import type { PeripheralsService } from "../../shared";
import { createDeviceListing } from "./devices";
import { captureMedia } from "./capture";
import { normalizeConstraints } from "./shared";

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
  return async (options = {}) => captureMedia(service, normalizeConstraints(options));
}
