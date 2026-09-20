import { createHostAdapters } from "./adapters";
import { createPeripheralPermissions, type PeripheralPermissions } from "./permissions";
import type { HostAdapter, PeripheralsService, PeripheralUpdate } from "./shared";

/** Shared trusted-host guard; adapters own only API-specific behavior. */
export function createPeripheralsHost(
  adapters: ReadonlyMap<string, HostAdapter> = createHostAdapters(),
  permissions: PeripheralPermissions = createPeripheralPermissions(),
): PeripheralsService {
  return {
    showPermissions(source) { permissions.show(source); },
    registerDocument(source) { return permissions.registerDocument(source); },
    start(request, update) {
      const adapter = adapters.get(request.capability);
      if (!adapter) throw new TypeError("Unknown peripheral capability");
      const run = adapter.prepare(request.method, request.args);
      const controller = new AbortController();
      const stop = () => controller.abort();
      const deliver = (value: PeripheralUpdate) => {
        if (controller.signal.aborted) return;
        if (value.type !== "data") stop();
        update(value);
      };
      window.addEventListener("pagehide", stop, { signal: controller.signal });
      void (async () => {
        const allowed = await permissions.authorize(request, adapter.permission, controller.signal, () => {
          deliver({ type: "error", name: "NotAllowedError", message: "Permission was revoked for this document." });
        });
        if (controller.signal.aborted) return;
        if (!allowed) {
          deliver({ type: "error", name: "NotAllowedError", message: "Access was denied for this document." });
          return;
        }
        controller.signal.addEventListener("abort", run(deliver), { once: true });
      })().catch(() => {
        deliver({ type: "error", name: "NotReadableError", message: "The host could not start the peripheral request." });
      });
      return stop;
    },
  };
}
