import type { PeripheralFeatures } from "./shared";

const prefix = "socialwiki-peripherals:";

// A browsing-context name is available synchronously, even in an opaque frame.
// Set it before navigation, consume it in init.js, then restore the empty name.
// This is feature metadata only; the host still checks every request's authority.
export function preparePeripheralsFrame(iframe: HTMLIFrameElement, features: PeripheralFeatures) {
  iframe.name = prefix + JSON.stringify(features);
}
export function readPeripheralFeatures(): PeripheralFeatures {
  if (!window.name.startsWith(prefix)) return {};
  const encoded = window.name.slice(prefix.length);
  window.name = "";
  try {
    const value = JSON.parse(encoded);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
