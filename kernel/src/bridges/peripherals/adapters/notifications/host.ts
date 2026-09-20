import type { HostAdapter } from "../../shared";
import { permissionKey } from "../../permissions";
import { normalizeNotice, notificationProperties, type NotificationCommand, type NotificationUpdate } from "./shared";
import { notificationPermission, observeNotificationPermission, refreshNotificationPermissions } from "./state";

export function createNotificationsAdapter(native: typeof Notification | undefined = globalThis.Notification): HostAdapter {
  return { features: { notifications: native ? {
    properties: notificationProperties.filter((key) => key in native.prototype),
    ...("maxActions" in native && typeof native.maxActions === "number" ? { maxActions: native.maxActions } : {}),
  } : undefined }, prepare(method, _args, context) {
    if (!native || !context || !["state", "connect"].includes(method)) throw new TypeError("Notifications are unavailable.");
    // Opening the facade and constructing a notification must never prompt.
    // Only the explicit permission command invokes the shared authorization UI.
    return { permissions: [], start(update) {
      if (method === "state") {
        queueMicrotask(() => update({ type: "data", value: notificationPermission(context, native) }));
        return { stop() {} };
      }
      const scope = { source: context.source, capability: "notifications" };
      const controller = new AbortController();
      let grant: AbortController | undefined;
      let requesting = false;
      const notifications = new Map<number, { notification: Notification; detach(): void }>();
      const emit = (value: NotificationUpdate) => {
        if (!controller.signal.aborted) update({ type: "data", value });
      };
      const unwatch = observeNotificationPermission(context, native, (permission) => emit({ type: "permission", permission }));
      async function requestPermission(id: number) {
        try {
          if (native!.permission !== "denied" && context!.permissions.state(scope) !== "granted") {
            grant?.abort(); grant = new AbortController();
            const allowed = await context!.permissions.authorize(context!.source,
              [{ capability: "notifications", label: "notifications" }], grant.signal, () => grant?.abort());
            if (!allowed || grant.signal.aborted) {
              grant.abort(); // A refused request must not remain in the active-permissions table.
              emit({ type: "permission", id, permission: notificationPermission(context!, native!) }); return;
            }
          }
          if (controller.signal.aborted) return;
          if (native!.permission === "default") await native!.requestPermission();
          refreshNotificationPermissions();
          emit({ type: "permission", id, permission: notificationPermission(context!, native!) });
        } catch {
          // Permission requests resolve a permission value, including when an engine refuses a prompt.
          emit({ type: "permission", id, permission: notificationPermission(context!, native!) });
        } finally { requesting = false; }
      }
      return {
        stop() {
          controller.abort(); grant?.abort(); unwatch();
          // Keep delivered notifications; detach callbacks into the departed document.
          for (const entry of notifications.values()) entry.detach();
          notifications.clear();
        },
        async send(value) {
          const command = value as NotificationCommand;
          if (controller.signal.aborted || !command || !Number.isSafeInteger(command.id) || command.id < 1) {
            throw new TypeError("Invalid notification command.");
          }
          const { id, method } = command;
          if (method === "permission") {
            if (requesting) throw new TypeError("A notification permission request is already pending.");
            requesting = true;
            void requestPermission(id); // Prompts have no RPC timeout; completion is an update.
            return;
          }
          if (method === "close") {
            notifications.get(id)?.notification.close(); return;
          }
          if (method !== "show" || !command.notice || notifications.has(id)) throw new TypeError("Invalid notification operation.");
          const permission = notificationPermission(context, native);
          emit({ type: "permission", permission });
          if (permission !== "granted") throw new DOMException("Notification permission is not granted for this site.", "NotAllowedError");
          const notice = normalizeNotice(command.notice.title, command.notice.options);
          if (notice.options.tag) notice.options.tag = JSON.stringify([permissionKey(scope), notice.options.tag]);
          const urls: string[] = [];
          const release = () => { for (const url of urls.splice(0)) URL.revokeObjectURL(url); };
          try {
            for (const key of ["icon", "badge", "image"] as const) {
              const blob = command.images?.[key];
              if (!blob) continue;
              if (!(blob instanceof Blob)) throw new TypeError("Invalid notification image.");
              const url = URL.createObjectURL(blob); urls.push(url); notice.options[key] = url;
            }
            // The browser supplies origin attribution; add only the guarded document path.
            const path = context.source.map(({ name }) => name || "Unnamed").join(" › ");
            const title = path ? `${path} — ${notice.title}` : notice.title;
            const notification = new native(title, notice.options);
            const events = ["show", "click", "close", "error"];
            const listener = (event: Event) => {
              emit({ type: "event", id, event: event.type });
              if (event.type === "close" || event.type === "error") { detach(); notifications.delete(id); }
            };
            const detach = () => { for (const event of events) notification.removeEventListener(event, listener); };
            // Native default click focusing remains intact. A relayed event cannot
            // synchronously cancel that default or carry native user activation.
            for (const event of events) notification.addEventListener(event, listener);
            notifications.set(id, { notification, detach });
            if (urls.length) {
              // Keep images alive until loaded, even if the document leaves meanwhile.
              const timer = setTimeout(release, 60000);
              const cleanup = () => {
                clearTimeout(timer); release();
                for (const event of ["show", "error", "close"]) notification.removeEventListener(event, cleanup);
              };
              for (const event of ["show", "error", "close"]) notification.addEventListener(event, cleanup);
            }
          } catch (error) { release(); throw error; }
        },
      };
    } };
  } };
}
