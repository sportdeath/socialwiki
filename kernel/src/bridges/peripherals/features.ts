import type { PeripheralFeatures, PeripheralsService } from "./shared";
import { withParentSource } from "../source";
import { consumeFrameData, prepareFrameData } from "../bootstrap";

export function preparePeripheralsFrame(iframe: HTMLIFrameElement, host: HTMLElement, service: PeripheralsService): void | Promise<void> {
  const write = (features: PeripheralFeatures) => prepareFrameData(iframe, "peripherals", features);
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
  const value = consumeFrameData("peripherals");
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
