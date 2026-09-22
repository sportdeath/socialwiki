import type { PeripheralsService } from "../../shared";
import { normalizeNotice, notificationProperties, type NoticeOptions, type NotificationUpdate } from "./shared";

export function installNotificationsAdapter(service: PeripheralsService) {
  if (!service.features.notifications) return;
  Object.defineProperty(window, "Notification", { configurable: true, writable: true,
    value: createNotificationConstructor(service) });
}

export function createNotificationConstructor(service: PeripheralsService): typeof Notification {
  let permission = service.features.notificationPermission ?? "default";
  let nextId = 0;
  let stopped = false;
  const notices = new Map<number, BridgedNotification>();
  const properties = new WeakMap<BridgedNotification, Record<string, unknown>>();
  let pending: { id: number; promise: Promise<NotificationPermission>; resolve(value: NotificationPermission): void } | undefined;
  let readyResolve!: () => void;
  const ready = new Promise<void>((resolve) => { readyResolve = resolve; });
  const session = service.start({ source: [], capability: "notifications", method: "connect", args: [] }, (event) => {
    if (event.type !== "data") { stop(true); return; }
    const value = event.value as NotificationUpdate;
    if (value.type === "permission") {
      permission = value.permission; readyResolve();
      if (pending && value.id === pending.id) { pending.resolve(permission); pending = undefined; }
    } else {
      const notification = notices.get(value.id);
      if (notification) {
        notification.dispatchEvent(new Event(value.event, { cancelable: value.event === "click" }));
        if (value.event === "close" || value.event === "error") notices.delete(value.id);
      }
    }
  });
  function stop(reportFailure = false) {
    if (stopped) return;
    stopped = true; permission = "default"; readyResolve();
    pending?.resolve(permission); pending = undefined;
    if (reportFailure) for (const notification of notices.values()) notification.dispatchEvent(new Event("error"));
    notices.clear(); session.stop();
  }
  window.addEventListener("pagehide", () => stop(), { once: true });

  class BridgedNotification extends EventTarget {
    static get permission() { return permission; }
    static requestPermission(callback?: NotificationPermissionCallback) {
      if (callback != null && typeof callback !== "function") return Promise.reject(new TypeError("Invalid permission callback."));
      if (stopped) {
        const result = Promise.resolve<NotificationPermission>("default");
        if (callback) void result.then(callback);
        return result;
      }
      if (!pending) {
        const id = ++nextId;
        let resolve!: (value: NotificationPermission) => void;
        const promise = new Promise<NotificationPermission>((done) => { resolve = done; });
        pending = { id, promise, resolve };
        void ready.then(async () => {
          if (stopped) { resolve("default"); return; }
          try { await session.send!({ method: "permission", id }); }
          catch { if (pending?.id === id) { pending = undefined; resolve(permission); } }
        });
      }
      const promise = pending.promise;
      if (callback) void promise.then(callback);
      return promise;
    }
    declare onclick: Notification["onclick"];
    declare onclose: Notification["onclose"];
    declare onerror: Notification["onerror"];
    declare onshow: Notification["onshow"];
    #id = ++nextId;
    #closed = false;
    #created = false;

    constructor(title: string, options?: NoticeOptions) {
      super();
      if (arguments.length === 0) throw new TypeError("A notification title is required.");
      const notice = normalizeNotice(title, options);
      properties.set(this, { ...notice.options, title: notice.title,
        vibrate: Object.freeze(notice.options.vibrate ?? []), actions: Object.freeze([]) });
      notices.set(this.#id, this);
      void this.#show(notice).catch((error) => {
        notices.delete(this.#id);
        if (!stopped && !this.#closed) this.dispatchEvent(new ErrorEvent("error", {
          message: error instanceof Error ? error.message : "The notification could not be displayed.",
        }));
      });
    }
    async #show(notice: ReturnType<typeof normalizeNotice>) {
      await ready;
      if (stopped || this.#closed) { notices.delete(this.#id); return; }
      const images: Record<string, Blob> = {};
      for (const key of ["icon", "badge", "image"] as const) {
        const url = notice.options[key];
        if (url?.startsWith("blob:")) {
          try { images[key] = await (await fetch(url)).blob(); }
          catch { notice.options[key] = ""; } // A failed icon must not suppress the notification.
        }
      }
      if (stopped || this.#closed) { notices.delete(this.#id); return; }
      await session.send!({ method: "show", id: this.#id, notice, images });
      this.#created = true;
      if (this.#closed && !stopped) await session.send!({ method: "close", id: this.#id });
    }
    close() {
      if (this.#closed) return;
      this.#closed = true;
      if (this.#created && !stopped) void session.send!({ method: "close", id: this.#id }).catch(() => {});
    }
  }
  const features = service.features.notifications;
  for (const key of notificationProperties) {
    if (!features?.properties.includes(key)) continue;
    Object.defineProperty(BridgedNotification.prototype, key, { configurable: true, enumerable: true,
      get() {
        const values = properties.get(this);
        if (!values) throw new TypeError("Illegal invocation");
        return values[key];
      },
    });
  }
  if (features?.maxActions !== undefined) {
    Object.defineProperty(BridgedNotification, "maxActions", { configurable: true, enumerable: true,
      get: () => features.maxActions });
  }
  for (const event of ["click", "close", "error", "show"]) {
    const handlers = new WeakMap<BridgedNotification, EventListener>();
    Object.defineProperty(BridgedNotification.prototype, `on${event}`, { configurable: true, enumerable: true,
      get() { return handlers.get(this) ?? null; },
      set(handler) {
        const previous = handlers.get(this);
        if (previous) this.removeEventListener(event, previous);
        handlers.delete(this);
        if (typeof handler === "function") { handlers.set(this, handler); this.addEventListener(event, handler); }
      },
    });
  }
  Object.defineProperty(BridgedNotification, "name", { value: "Notification" });
  return BridgedNotification as unknown as typeof Notification;
}
