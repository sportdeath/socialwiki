import type { PeripheralFeatures, PeripheralsService } from "./shared";
import { withParentSource } from "../source";

const prefix = "socialwiki-peripherals:";

// A browsing-context name is available synchronously, even in an opaque frame.
// Set it before navigation, consume it in init.js, then restore the empty name.
// This is feature metadata only; the host still checks every request's authority.
export function preparePeripheralsFrame(iframe: HTMLIFrameElement, host: HTMLElement, service: PeripheralsService): void | Promise<void> {
  const write = (features: PeripheralFeatures) => { iframe.name = prefix + JSON.stringify(features); };
  if (!service.features.notifications) return write(service.features);

  // Fetch only this child's state; never expose other documents' saved decisions.
  const source = withParentSource(host, []);
  return new Promise<NotificationPermission>((resolve) => {
    const session = service.start({ source, capability: "notifications", method: "state", args: [] }, (event) => {
      session.stop();
      resolve(event.type === "data" ? event.value as NotificationPermission : "default");
    });
  }).then((permission) => write({ ...service.features, notificationPermission: permission }));
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
