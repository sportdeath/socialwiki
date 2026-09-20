// Feasibility probe only: deliberately no Notification facade or production registration.
import type { HostAdapter, PeripheralsService, PeripheralSession } from "../../../src/bridges/peripherals/shared";
import theme from "../../../../theme.css";

declare global {
  interface Window {
    notificationDiagnosticConfig: { base: string; depth: number; native: boolean; kernelSha256: string };
  }
}
const config = window.notificationDiagnosticConfig;
const capability = "notification-diagnostic";
const frame = window === top ? "host" : crypto.randomUUID();
const entries: unknown[] = [];
const outstanding = new Set<Notification>();
const activation = () => ({ active: navigator.userActivation?.isActive,
  everActive: navigator.userActivation?.hasBeenActive, focused: document.hasFocus(), visibility: document.visibilityState });
const errorInfo = (error: unknown) => error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
function log(event: string, detail: unknown = {}) {
  const entry = { frame, at: new Date().toISOString(), event, detail, ...activation() };
  if (window === top) record(entry);
  else top!.postMessage({ notificationDiagnostic: true, entry }, "*");
}
function record(entry: unknown) {
  entries.push(entry);
}
const status = () => ({ supported: "Notification" in window,
  permission: "Notification" in window ? Notification.permission : "unavailable", ...activation() });
function requestNative() {
  log("native-permission-request", status());
  // Invoke before any await: the probe must not accidentally consume the click activation.
  const promise = Notification.requestPermission();
  return promise.then((permission) => { log("native-permission-result", { permission }); return permission; });
}
type Notice = { id: string; icon?: string; click: string };
type NoticeEvent = { id: string; event: string; trusted: boolean; cancelable: boolean };
function showNative(notice: Notice, deliver: (event: NoticeEvent) => void, baseline = false) {
  log("native-create", { ...notice, ...status() });
  const notification = new Notification(`Social.Wiki test ${notice.id.slice(0, 6)}`, {
    body: "Click to test focus and event delivery. This notification is not closed on page teardown.",
    icon: notice.icon, requireInteraction: true, data: { diagnostic: notice.id },
  });
  outstanding.add(notification);
  for (const eventName of ["show", "click", "close", "error"]) notification.addEventListener(eventName, (event) => {
    log(`native-${eventName}`, { id: notice.id, trusted: event.isTrusted, cancelable: event.cancelable });
    if (eventName === "close") outstanding.delete(notification);
    if (baseline && eventName === "click") handleClick(notice.click, event);
    deliver({ id: notice.id, event: eventName, trusted: event.isTrusted, cancelable: event.cancelable });
  });
  return notification;
}
function handleClick(mode: string, event: Event) {
  if (mode === "prevent") event.preventDefault();
  if (mode === "popup") {
    const popup = window.open(`${config.base}/popup`, "_blank");
    log("click-popup-result", { opened: Boolean(popup) });
    if (popup) popup.opener = null;
  }
  if (mode === "focus") window.focus();
  log("click-handler", { mode, defaultPrevented: event.defaultPrevented, trusted: event.isTrusted });
}

export function createDiagnosticAdapter(): HostAdapter {
  return { prepare(method, _args, context) {
    if (method !== "status" && method !== "request") throw new TypeError("Unknown diagnostic operation");
    return { permissions: method === "request" ? [{ capability, label: "notifications (diagnostic)" }] : [],
      start(update) {
        if (method === "status") {
          queueMicrotask(() => update({ type: "data", value: { ...status(), sitePermission: context!.permissions.state({ source: context!.source, capability }) } }));
          return { stop() {} };
        }
        let live = true;
        const notifications = new Map<string, Notification>();
        const emit = (value: unknown) => { if (live) update({ type: "data", value }); };
        log("site-guard-allowed", { source: context!.source });
        try {
          void requestNative().then((permission) => emit({ permission }), (error) => emit({ failure: errorInfo(error) }));
        } catch (error) { queueMicrotask(() => emit({ failure: errorInfo(error) })); }
        return {
          stop() { live = false; log("document-session-stopped", { keptNotifications: notifications.size }); },
          async send(message: unknown) {
            const command = message as { method: string; notice: Notice };
            if (command.method === "close") {
              for (const notification of notifications.values()) notification.close();
              notifications.clear(); return;
            }
            if (command.method !== "show") throw new TypeError("Unknown diagnostic command");
            if (Notification.permission !== "granted") throw new DOMException("Native notification permission is not granted", "NotAllowedError");
            const notice = command.notice;
            const notification = showNative(notice, (event) => { emit(event); if (event.event === "close") notifications.delete(event.id); });
            notifications.set(notice.id, notification);
          },
        };
      },
    };
  } };
}

type ProbeAPI = { status(): Promise<unknown>; request(): Promise<string>; show(notice: Notice): Promise<void>; close(): Promise<void>; permissions?(): Promise<void> };
export function installDiagnostic(service: PeripheralsService) {
  let session: PeripheralSession | undefined;
  const notices = new Map<string, Notice>();
  const api: ProbeAPI = {
    async permissions() { await service.showPermissions([]); },
    status: () => new Promise((resolve, reject) => {
      const request = service.start({ source: [], capability, method: "status", args: [] }, (update) => {
        request.stop();
        if (update.type === "data") resolve(update.value); else reject(update);
      });
    }),
    request: () => new Promise((resolve, reject) => {
      session?.stop();
      session = service.start({ source: [], capability, method: "request", args: [] }, (update) => {
        log("bridge-update", update);
        if (update.type !== "data") { showResult(update); reject(update); return; }
        const value = update.value as NoticeEvent & { permission?: string; failure?: unknown };
        if (value.failure) reject(value.failure);
        if (value.permission) resolve(value.permission);
        if (value.event) {
          showResult(value);
          if (value.event === "click") handleClick(notices.get(value.id)!.click, new Event("click", { cancelable: value.cancelable }));
        }
      });
    }),
    async show(notice) {
      if (!session) throw new Error("Click Request permission first in this experiment.");
      notices.set(notice.id, notice);
      await session.send!({ method: "show", notice });
    },
    async close() { await session?.send!({ method: "close" }); },
  };
  window.addEventListener("DOMContentLoaded", () => { if (document.getElementById("notification-probe")) mountControls(api); }, { once: true });
}
function showResult(value: unknown) {
  const output = document.getElementById("probe-status");
  if (output) output.textContent = JSON.stringify(value, null, 2);
}
function mountControls(api: ProbeAPI) {
  const main = document.getElementById("notification-probe")!;
  main.innerHTML = `<h1>${config.native ? "Native baseline" : `Bridged notifications · depth ${config.depth}`}</h1>
    <p>Feasibility experiment, not the finished native-API adapter. Request permission, then send a notification.</p>
    <button id="permission">Request permission</button><button id="status">Read permission state</button>${api.permissions ? '<button id="permissions">Social.Wiki permissions</button>' : ""}
    <label>On notification click <select id="click"><option value="none">Log only (native default focus)</option><option value="focus">Call window.focus()</option><option value="popup">Open a test window</option><option value="prevent">Call preventDefault()</option></select></label>
    <label>Icon <select id="icon"><option value="none">None</option><option value="data">Data URL: blue square</option><option value="blob">Document blob URL: blue square</option></select></label>
    <button id="show">Send now</button><button id="delay">Send in 5 seconds</button><button id="close-notices">Close this session's notifications</button>
    <p>For focus tests, select another tab or app before clicking the notification. For persistence, download the report, then remove the document or close this tab.</p>
    <output id="probe-status">Ready</output>`;
  const run = (name: string, action: () => Promise<unknown>) => {
    log(name); showResult(`${name}: waiting…`);
    try { void action().then((value) => { log(`${name}-result`, value); showResult(value ?? "Done"); }, failed); }
    catch (error) { failed(error); }
  };
  function failed(error: unknown) { log("operation-error", errorInfo(error)); showResult(error instanceof Error ? errorInfo(error) : error); }
  const bind = (id: string, action: () => Promise<unknown>) => { document.getElementById(id)!.onclick = () => run(id, action); };
  const blobs: string[] = [];
  async function send() {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const drawing = canvas.getContext("2d")!; drawing.fillStyle = "#3366cc"; drawing.fillRect(0, 0, 64, 64);
    const kind = (document.getElementById("icon") as HTMLSelectElement).value;
    let icon: string | undefined;
    if (kind === "data") icon = canvas.toDataURL();
    if (kind === "blob") {
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
      icon = URL.createObjectURL(blob); blobs.push(icon);
    }
    const notice = { id: crypto.randomUUID(), icon, click: (document.getElementById("click") as HTMLSelectElement).value };
    await api.show(notice); return { created: notice.id, icon: kind };
  }
  bind("permission", () => api.request()); bind("status", () => api.status()); bind("show", send);
  if (api.permissions) bind("permissions", api.permissions);
  bind("delay", () => new Promise((resolve, reject) => setTimeout(() => { send().then(resolve, reject); }, 5000)));
  bind("close-notices", () => api.close());
  window.addEventListener("pagehide", () => { for (const url of blobs) URL.revokeObjectURL(url); });
  void api.status().then((value) => { log("initial-permission-state", value); showResult(value); }, failed);
}

if (config && window === top) {
  window.addEventListener("message", ({ data }) => { if (data?.notificationDiagnostic === true) record(data.entry); });
  window.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    // The kernel replaces the root DOM. Mount after that, with space reserved above its frame.
    const panel = document.createElement("section");
    const shadow = panel.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${theme}:host {display:block;background:var(--background-color);color:var(--text-color);font:14px system-ui;padding:10px;box-sizing:border-box;border-bottom:1px solid var(--border-color)} button,a,textarea {font:inherit;margin:3px} a {color:var(--link-color)} textarea {width:98%;box-sizing:border-box}</style>
      <a href="/?depth=3">Bridge depth 3</a> · <a href="/?depth=1">Depth 1</a> · <a href="/?native=1">Native baseline</a>
      <button id="download">Download report</button><button id="remove">Remove document</button><button id="cleanup">Close all test notifications</button>
      <textarea rows="2" placeholder="Observations: prompt appeared? icon visible? tab focused? notification survived removal/reload/tab close?"></textarea><span id="count"></span>`;
    document.body.prepend(panel);
    const root = document.querySelector<HTMLElement>("sw-transclude");
    if (root) new ResizeObserver(() => { const height = panel.getBoundingClientRect().height; root.style.top = `${height}px`; root.style.height = `calc(100dvh - ${height}px)`; }).observe(panel);
    shadow.getElementById("remove")!.onclick = () => { log("remove-document"); root?.remove(); };
    shadow.getElementById("cleanup")!.onclick = () => { for (const notification of outstanding) notification.close(); outstanding.clear(); };
    shadow.getElementById("download")!.onclick = () => {
      const report = { version: 1, config, userAgent: navigator.userAgent, secure: isSecureContext,
        native: status(), notes: shadow.querySelector("textarea")!.value, entries };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `notifications-${config.native ? "native" : `depth${config.depth}`}-${Date.now()}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      shadow.getElementById("count")!.textContent = `${entries.length} events exported`;
    };
    if (config.native) mountControls({ status: async () => status(), request: requestNative,
      async show(notice) { showNative(notice, showResult, true); },
      async close() { for (const notification of outstanding) notification.close(); outstanding.clear(); },
    });
    log("host-ready", status());
  }, 0), { once: true });
  for (const event of ["focus", "blur", "pagehide"]) window.addEventListener(event, () => log(`host-${event}`));
  document.addEventListener("visibilitychange", () => log("host-visibility"));
}
