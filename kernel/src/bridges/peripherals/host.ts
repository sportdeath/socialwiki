import { createHostAdapters } from "./adapters";
import { createPeripheralPermissions, type PeripheralPermissions } from "./permissions";
import type { HostAdapter, PeripheralSession, PeripheralsService, PeripheralUpdate } from "./shared";

/** Shared trusted-host guard; adapters own only API-specific behavior. */
export function createPeripheralsHost(
  adapters: ReadonlyMap<string, HostAdapter> = createHostAdapters(),
  permissions: PeripheralPermissions = createPeripheralPermissions(),
): PeripheralsService {
  return {
    features: Object.assign({}, ...[...adapters.values()].map((adapter) => adapter.features)),
    showPermissions(source) { permissions.show(source); },
    registerDocument(source) { return permissions.registerDocument(source); },
    start(request, update) {
      const adapter = adapters.get(request.capability);
      if (!adapter) throw new TypeError("Unknown peripheral capability");
      const prepared = adapter.prepare(request.method, request.args, { source: request.source, permissions });
      const controller = new AbortController();
      let session: PeripheralSession | undefined;
      const stop = () => controller.abort();
      const deliver = (value: PeripheralUpdate) => {
        if (controller.signal.aborted) return;
        if (value.type !== "data") stop();
        update(value);
      };
      window.addEventListener("pagehide", stop, { signal: controller.signal });
      void (async () => {
        const allowed = await permissions.authorize(request.source, prepared.permissions,
          controller.signal, () => {
            deliver({ type: "error", name: "NotAllowedError", message: "Permission was revoked for this document." });
          });
        if (controller.signal.aborted) return;
        if (!allowed) {
          deliver({ type: "error", name: "NotAllowedError", message: "Access was denied for this document." });
          return;
        }
        session = prepared.start(deliver);
        if (controller.signal.aborted) session.stop();
        else controller.signal.addEventListener("abort", () => session!.stop(), { once: true });
      })().catch(() => {
        deliver({ type: "error", name: "NotReadableError", message: "The host could not start the peripheral request." });
      });
      return { stop, async send(message) {
        if (controller.signal.aborted || !session?.send) throw new Error("Peripheral request is unavailable.");
        return session.send(message);
      } };
    },
  };
}
