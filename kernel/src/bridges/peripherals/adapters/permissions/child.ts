import type { PeripheralsService } from "../../shared";
import { permissionNames } from "./shared";

export function installPermissionsAdapter(service: PeripheralsService) {
  const permissions = navigator.permissions ?? {};
  const nativeQuery = permissions.query?.bind(permissions);
  const query = createPermissionQuery(service);
  Object.defineProperty(permissions, "query", { configurable: true, writable: true,
    value: (descriptor: PermissionDescriptor) => permissionNames.includes(descriptor?.name) ? query(descriptor)
      : nativeQuery ? nativeQuery(descriptor) : Promise.reject(new TypeError("Unsupported permission name.")) });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: permissions });
}
export function createPermissionQuery(service: Pick<PeripheralsService, "start">) {
  return (descriptor: PermissionDescriptor) => new Promise<PermissionStatus>((resolve, reject) => {
    let state: PermissionState = "prompt";
    let initialized = false;
    const status = Object.assign(new EventTarget(), { onchange: null as PermissionStatus["onchange"] });
    Object.defineProperties(status, { state: { get: () => state }, name: { value: descriptor.name } });
    const session = service.start({ source: [], capability: "permissions", method: "query", args: [descriptor] }, (event) => {
      if (event.type !== "data") {
        reject(event.type === "error" ? new DOMException(event.message, event.name) : new DOMException("Permission query ended.", "AbortError"));
        return;
      }
      const next = event.value as PermissionState;
      const changed = state !== next;
      state = next;
      if (!initialized) { initialized = true; resolve(status as PermissionStatus); }
      else if (changed) {
        const event = new Event("change");
        status.dispatchEvent(event);
        status.onchange?.call(status as PermissionStatus, event);
      }
    });
    window.addEventListener("pagehide", () => { session.stop(); reject(new DOMException("Document closed.", "AbortError")); }, { once: true });
  });
}
