import type { AdapterContext } from "../../shared";

const observers = new Set<() => void>();
export function refreshNotificationPermissions() { for (const refresh of observers) refresh(); }

export function notificationPermission(context: AdapterContext, native: typeof Notification): NotificationPermission {
  const site = context.permissions.state({ source: context.source, capability: "notifications" });
  if (site === "denied" || native.permission === "denied") return "denied";
  return site === "granted" && native.permission === "granted" ? "granted" : "default";
}

/** Notification.permission also works in engines without a notifications Permissions query. */
export function observeNotificationPermission(context: AdapterContext, native: typeof Notification,
  update: (permission: NotificationPermission) => void) {
  let stopped = false;
  let previous: NotificationPermission | undefined;
  let status: PermissionStatus | undefined;
  const refresh = () => {
    if (stopped) return;
    const state = notificationPermission(context, native);
    if (state !== previous) { previous = state; update(state); }
  };
  const unsubscribe = context.permissions.subscribe(refresh);
  observers.add(refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  void navigator.permissions?.query({ name: "notifications" }).then((value) => {
    if (stopped) return;
    status = value; status.addEventListener("change", refresh); refresh();
  }).catch(() => {});
  refresh();
  return () => {
    stopped = true; unsubscribe(); observers.delete(refresh); status?.removeEventListener("change", refresh);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}
