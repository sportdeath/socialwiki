import { afterEach, expect, it, vi } from "vitest";
import { Storage as DOMStorage } from "happy-dom";
import { createNotificationsAdapter } from "../src/bridges/peripherals/adapters/notifications/host";
import { createNotificationConstructor } from "../src/bridges/peripherals/adapters/notifications/child";
import { normalizeNotice, notificationProperties } from "../src/bridges/peripherals/adapters/notifications/shared";
import { createPeripheralPermissions, type AskPermission } from "../src/bridges/peripherals/permissions";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPermissionsAdapter } from "../src/bridges/peripherals/adapters/permissions/host";
import { createPermissionQuery } from "../src/bridges/peripherals/adapters/permissions/child";
import { preparePeripheralsFrame, readPeripheralFeatures } from "../src/bridges/peripherals/features";
import type { PeripheralsService } from "../src/bridges/peripherals/shared";

const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function prepareFrame(iframe: HTMLIFrameElement, service: PeripheralsService, id: string) {
  const host = document.createElement("div"); host.id = id; host.setAttribute("name", id);
  return preparePeripheralsFrame(iframe, host, service);
}

function setup(ask: AskPermission = vi.fn(async () => ({ allow: true, remember: false })), storage: Storage | null = null,
  supportedProperties: readonly string[] = notificationProperties) {
  class Native extends EventTarget {
    static permission: NotificationPermission = "default";
    static notices: Native[] = [];
    static requestPermission = vi.fn(async () => { Native.permission = "granted"; return Native.permission; });
    close = vi.fn(() => this.dispatchEvent(new Event("close")));
    constructor(public title: string, public options: NotificationOptions) {
      super(); Native.notices.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event("show")));
    }
  }
  // Native Web IDL attributes live on the prototype, unlike TS parameter properties.
  for (const key of supportedProperties) {
    Object.defineProperty(Native.prototype, key, { get() { return this.options[key]; } });
  }
  vi.stubGlobal("Notification", Native);
  const permissions = createPeripheralPermissions({ storage, ask });
  const host = createPeripheralsHost(new Map([
    ["notifications", createNotificationsAdapter(Native as unknown as typeof Notification)],
    ["permissions", createPermissionsAdapter()],
  ]), permissions);
  const scoped = (id: string): PeripheralsService => ({ ...host,
    start(request, update) { return host.start({ ...request, source: [{ id, name: id }, ...request.source] }, update); },
  });
  const service = scoped("messages");
  const Notifications = createNotificationConstructor(service);
  return { Native, permissions, host, service, scoped, Notifications, ask };
}

it("exposes supported attributes on the prototype and omits browser-unsupported features", async () => {
  const supported = ["title", "body", "data", "tag", "requireInteraction"];
  const s = setup(undefined, null, supported);
  const notice = new s.Notifications("Hello", { body: "World", image: "icon.png", requireInteraction: true } as NotificationOptions);
  for (const key of supported) {
    expect(key in s.Notifications.prototype).toBe(true);
    expect(Object.hasOwn(notice, key)).toBe(false);
    expect(Object.getOwnPropertyDescriptor(s.Notifications.prototype, key)?.set).toBeUndefined();
  }
  expect(notice.title).toBe("Hello"); expect(notice.body).toBe("World");
  expect(notice.requireInteraction).toBe(true);
  for (const key of ["image", "vibrate", "navigate"]) {
    expect(key in s.Notifications.prototype).toBe(false);
    expect(key in notice).toBe(false);
  }
  expect("maxActions" in s.Notifications).toBe(false);
  // The capability snapshot is serializable and works through nested frame bootstrap.
  const iframe = document.createElement("iframe");
  await prepareFrame(iframe, s.host, "messages");
  window.name = iframe.name;
  const restored = createNotificationConstructor({ ...s.service, features: readPeripheralFeatures() });
  expect("requireInteraction" in restored.prototype).toBe(true);
  expect("image" in restored.prototype).toBe(false);
});

it("preserves the host's maxActions feature when present", () => {
  const s = setup();
  Object.defineProperty(s.Native, "maxActions", { get: () => 2 });
  const adapter = createNotificationsAdapter(s.Native as unknown as typeof Notification);
  const Notifications = createNotificationConstructor({ ...s.service, features: adapter.features! });
  expect(Notifications.maxActions).toBe(2);
});

it("supports ordinary requestPermission / constructor / listener / close usage with one site prompt", async () => {
  const s = setup();
  expect(s.Notifications.permission).toBe("default");
  expect(await s.Notifications.requestPermission()).toBe("granted");
  const notice = new s.Notifications("Hello", { body: "Message", data: { unread: 2 } });
  const shown = vi.fn(); const clicked = vi.fn(); const closed = vi.fn();
  notice.onshow = shown; notice.onclick = clicked; notice.addEventListener("close", closed);
  expect(notice.title).toBe("Hello"); expect(notice.body).toBe("Message"); expect(notice.data).toEqual({ unread: 2 });
  expect(notice instanceof s.Notifications).toBe(true);
  await flush(); expect(shown).toHaveBeenCalledOnce();
  expect(s.Native.notices[0].title).toBe("messages — Hello");
  expect(notice.title).toBe("Hello");
  s.Native.notices[0].dispatchEvent(new Event("click", { cancelable: true }));
  expect(clicked).toHaveBeenCalledOnce(); expect(clicked.mock.instances[0]).toBe(notice);
  notice.close(); await flush(); expect(closed).toHaveBeenCalledOnce();
  new s.Notifications("Second"); await flush();
  expect(s.Native.notices).toHaveLength(2); expect(s.ask).toHaveBeenCalledOnce();
});

it("never prompts on construction, and refuses ungranted notifications at the host", async () => {
  const s = setup(); s.Native.permission = "granted";
  const notice = new s.Notifications("Unauthorized"); const error = vi.fn(); notice.onerror = error;
  await flush(); expect(error).toHaveBeenCalledOnce();
  expect(s.Native.notices).toHaveLength(0); expect(s.ask).not.toHaveBeenCalled();
});

it("combines native denial with the site decision without prompting again", async () => {
  const s = setup(); s.Native.permission = "denied";
  expect(await s.Notifications.requestPermission()).toBe("denied");
  expect(s.Notifications.permission).toBe("denied");
  expect(s.ask).not.toHaveBeenCalled(); expect(s.Native.requestPermission).not.toHaveBeenCalled();
});

it("does not request native permission when the site guard denies", async () => {
  const s = setup(async () => ({ allow: false, remember: true }));
  expect(await s.Notifications.requestPermission()).toBe("denied");
  expect(s.Native.requestPermission).not.toHaveBeenCalled();
});

it("releases a dismissed authorization and permits a fresh request", async () => {
  const ask = vi.fn<AskPermission>(async () => ({ allow: false, remember: false }));
  const s = setup(ask);
  expect(await s.Notifications.requestPermission()).toBe("default");
  expect(ask.mock.calls[0][2].aborted).toBe(true);
  expect(s.Native.requestPermission).not.toHaveBeenCalled();
  ask.mockResolvedValueOnce({ allow: true, remember: false });
  expect(await s.Notifications.requestPermission()).toBe("granted");
  expect(ask.mock.calls[1][2].aborted).toBe(false);
});

it("coalesces concurrent permission requests and supports the legacy callback", async () => {
  const s = setup(); const callback = vi.fn();
  const first = s.Notifications.requestPermission(callback); const second = s.Notifications.requestPermission();
  expect(first).toBe(second); expect(await first).toBe("granted");
  expect(callback).toHaveBeenCalledWith("granted"); expect(s.ask).toHaveBeenCalledOnce();
});

it("initializes synchronous permission state for just the intended scope", async () => {
  const s = setup(); s.Native.permission = "granted";
  await s.Notifications.requestPermission();
  const iframe = document.createElement("iframe");
  await prepareFrame(iframe, s.host, "messages");
  window.name = iframe.name;
  const features = readPeripheralFeatures();
  expect(features.notificationPermission).toBe("granted");
  const restored = createNotificationConstructor({ ...s.service, features });
  expect(restored.permission).toBe("granted");
  new restored("Already allowed"); await flush();
  expect(s.Native.notices).toHaveLength(1); expect(s.ask).toHaveBeenCalledOnce();
  await prepareFrame(iframe, s.host, "other");
  window.name = iframe.name; expect(readPeripheralFeatures().notificationPermission).toBe("default");
  expect(iframe.name).not.toContain("messages");
});

it("restores a remembered grant into a new host without another prompt", async () => {
  const storage = new DOMStorage();
  const s = setup(async () => ({ allow: true, remember: true }), storage);
  await s.Notifications.requestPermission(); window.dispatchEvent(new Event("pagehide"));
  const ask = vi.fn(async () => ({ allow: false, remember: false }));
  const permissions = createPeripheralPermissions({ storage, ask });
  const host = createPeripheralsHost(new Map([["notifications", createNotificationsAdapter(s.Native as unknown as typeof Notification)]]), permissions);
  const source = [{ id: "messages", name: "Messages" }];
  const iframe = document.createElement("iframe"); await prepareFrame(iframe, host, "messages");
  window.name = iframe.name;
  const restored = createNotificationConstructor({ ...host, features: readPeripheralFeatures(),
    start(request, update) { return host.start({ ...request, source }, update); },
  });
  expect(restored.permission).toBe("granted");
  new restored("After reload"); await flush();
  expect(s.Native.notices).toHaveLength(1); expect(ask).not.toHaveBeenCalled();
});

it("composes bootstrap permission scopes through ancestors and honors explicit inheritance", async () => {
  const s = setup(); await s.Notifications.requestPermission();
  const host = document.createElement("div"); host.id = "child";
  const iframe = document.createElement("iframe");
  await preparePeripheralsFrame(iframe, host, s.service);
  window.name = iframe.name;
  expect(readPeripheralFeatures().notificationPermission).toBe("default");
  host.setAttribute("permission-scope", "inherit");
  await preparePeripheralsFrame(iframe, host, s.service);
  window.name = iframe.name;
  expect(readPeripheralFeatures().notificationPermission).toBe("granted");
  expect(s.ask).toHaveBeenCalledOnce();
});

it("updates Notification.permission and PermissionStatus together on grant/revocation/native changes", async () => {
  const s = setup();
  const status = await createPermissionQuery(s.service)({ name: "notifications" });
  const changed = vi.fn(); status.onchange = changed;
  expect(status.state).toBe("prompt");
  await s.Notifications.requestPermission();
  expect(status.state).toBe("granted");
  s.Native.permission = "denied"; window.dispatchEvent(new Event("focus"));
  expect(status.state).toBe("denied"); expect(s.Notifications.permission).toBe("denied");
  s.Native.permission = "granted"; window.dispatchEvent(new Event("focus"));
  s.permissions.revoke({ source: [{ id: "messages", name: "" }], capability: "notifications" });
  await flush(); expect(s.Notifications.permission).toBe("default"); expect(status.state).toBe("prompt");
  const notice = new s.Notifications("Revoked"); const error = vi.fn(); notice.onerror = error;
  await flush(); expect(error).toHaveBeenCalledOnce(); expect(s.Native.notices).toHaveLength(0);
  expect(changed).toHaveBeenCalled();
});

it("preserves native focus behavior and isolates tags without changing exposed tags", async () => {
  const s = setup(); const other = createNotificationConstructor(s.scoped("other"));
  await s.Notifications.requestPermission(); await other.requestPermission();
  const notice = new s.Notifications("A", { tag: "message" });
  new other("B", { tag: "message" }); await flush();
  expect(notice.tag).toBe("message");
  expect(s.Native.notices[0].options.tag).not.toBe(s.Native.notices[1].options.tag);
  notice.onclick = (event) => event.preventDefault();
  const nativeClick = new Event("click", { cancelable: true });
  s.Native.notices[0].dispatchEvent(nativeClick); expect(nativeClick.defaultPrevented).toBe(false);
});

it("leaves delivered notifications open on teardown but detaches document callbacks", async () => {
  const s = setup(); await s.Notifications.requestPermission();
  const notice = new s.Notifications("Keep me"); const clicked = vi.fn(); notice.onclick = clicked;
  await flush(); window.dispatchEvent(new Event("pagehide"));
  expect(s.Native.notices[0].close).not.toHaveBeenCalled();
  s.Native.notices[0].dispatchEvent(new Event("click")); expect(clicked).not.toHaveBeenCalled();
});

it("cancels close-before-create without displaying a late notification", async () => {
  const s = setup(); await s.Notifications.requestPermission();
  const notice = new s.Notifications("Never show"); notice.close(); await flush();
  expect(s.Native.notices).toHaveLength(0);
});

it("can close from onshow before the creation RPC acknowledges", async () => {
  const s = setup(); await s.Notifications.requestPermission();
  const notice = new s.Notifications("Close on show"); const closed = vi.fn();
  notice.onshow = () => notice.close(); notice.onclose = closed;
  await flush();
  expect(s.Native.notices[0].close).toHaveBeenCalledOnce(); expect(closed).toHaveBeenCalledOnce();
});

it("does not trust a forged synchronous permission snapshot", async () => {
  const s = setup(); s.Native.permission = "granted";
  const forged = createNotificationConstructor({ ...s.service,
    features: { ...s.service.features, notificationPermission: "granted" } });
  const notice = new forged("Blocked by host"); const failed = vi.fn(); notice.onerror = failed;
  await flush(); expect(failed).toHaveBeenCalledOnce(); expect(s.Native.notices).toHaveLength(0);
  expect(s.ask).not.toHaveBeenCalled();
});

it("does not resurrect a document when a native permission prompt settles after teardown", async () => {
  const s = setup(); let complete!: (value: NotificationPermission) => void;
  s.Native.requestPermission.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const permission = s.Notifications.requestPermission(); await flush();
  window.dispatchEvent(new Event("pagehide")); expect(await permission).toBe("default");
  s.Native.permission = "granted"; complete("granted"); await flush();
  expect(s.Notifications.permission).toBe("default"); expect(s.Native.notices).toHaveLength(0);
});

it("validates synchronously and snapshots structured data", () => {
  const s = setup();
  expect(() => new s.Notifications("Bad", { data: () => {} })).toThrow();
  expect(() => normalizeNotice("Bad", { renotify: true })).toThrow(TypeError);
  expect(() => normalizeNotice("Bad", { silent: true, vibrate: [10] })).toThrow(TypeError);
  expect(() => normalizeNotice("Bad", { actions: [{}] })).toThrow(TypeError);
  expect(() => normalizeNotice("Bad", { navigate: "javascript:alert(1)" })).toThrow(/not supported/);
  const data = { value: 1 }; const notice = new s.Notifications("Clone", { data });
  data.value = 2; expect(notice.data).toEqual({ value: 1 });
  expect(normalizeNotice("URL", { icon: "icon.png" }, "https://example.com/app/").options.icon).toBe("https://example.com/app/icon.png");
});

it("transfers document blob icons and releases host object URLs after native show", async () => {
  const s = setup(); await s.Notifications.requestPermission();
  const blob = new Blob(["image"], { type: "image/png" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => blob })));
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:https://host/image");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const notice = new s.Notifications("Icon", { icon: "blob:null/document-image" });
  await flush();
  expect(notice.icon).toBe("blob:null/document-image");
  expect(create).toHaveBeenCalledWith(blob); expect(s.Native.notices[0].options.icon).toBe("blob:https://host/image");
  expect(revoke).toHaveBeenCalledWith("blob:https://host/image");
});
