import type { HostAdapter } from "../../shared";
import { observeNotificationPermission } from "../notifications/state";
import { permissionNames } from "./shared";

/** A document is permitted only when both the site guard and browser permit it. */
export function createPermissionsAdapter(native: Permissions | undefined = navigator.permissions): HostAdapter {
  return { prepare(method, args, context) {
    const descriptor = args[0] as PermissionDescriptor;
    if (method !== "query" || !permissionNames.includes(descriptor?.name) || !context) {
      throw new TypeError("Unsupported permission query.");
    }
    return { permissions: [], start(update) {
      if (descriptor.name === "notifications" && globalThis.Notification) {
        return { stop: observeNotificationPermission(context, Notification, (permission) =>
          update({ type: "data", value: permission === "default" ? "prompt" : permission })) };
      }
      let stopped = false;
      let status: PermissionStatus | undefined;
      let last: PermissionState | undefined;
      const refresh = () => {
        if (stopped) return;
        const site = context.permissions.state({ source: context.source, capability: descriptor.name });
        const state = site === "denied" || status?.state === "denied" ? "denied"
          : site === "prompt" || status?.state === "prompt" ? "prompt" : "granted";
        if (state === last) return;
        last = state;
        update({ type: "data", value: state });
      };
      let unsubscribe = () => {};
      void (async () => {
        // Permission names vary between engines. Where querying is unavailable,
        // report the guard's state; the native operation still enforces its grant.
        try { status = await native?.query(descriptor); } catch { /* No native query support. */ }
        if (stopped) return;
        status?.addEventListener("change", refresh);
        unsubscribe = context.permissions.subscribe(refresh);
        refresh();
      })();
      return { stop() {
        stopped = true; unsubscribe(); status?.removeEventListener("change", refresh);
      } };
    } };
  } };
}
