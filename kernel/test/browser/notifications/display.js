// Test-only instrumentation. Native control buttons use the original constructor
// directly; only calls from the real production adapter go through the recorder.
(() => {
  const config = window.notificationDisplayConfig;
  if (!config) return;
  const isHost = window === window.top;
  const Native = window.Notification;
  const entries = [];
  const held = new Set();
  let lastOptions;
  let panel;
  const state = () => ({ permission: window.Notification?.permission ?? "unavailable",
    visible: document.visibilityState, focused: document.hasFocus(), active: navigator.userActivation?.isActive });
  function record(entry) {
    entries.push(entry);
    if (!panel) return;
    panel.querySelector("#events").textContent = entries.map((item) =>
      `${item.at.slice(11, 23)} ${item.realm} ${item.event} ${JSON.stringify(item.detail)}`).join("\n");
    panel.querySelector("#count").textContent = `${entries.length} events`;
  }
  function log(event, detail = {}) {
    const entry = { at: new Date().toISOString(), realm: isHost ? "host" : "document", event, detail, state: state() };
    if (isHost) record(entry);
    else window.top.postMessage({ notificationDisplay: true, entry }, "*");
  }
  const failure = (error) => ({ name: error?.name, message: error?.message ?? String(error) });
  const title = (label) => `${label} · ${new Date().toLocaleTimeString()} · ${Math.random().toString(36).slice(2, 6)}`;
  const timers = new Set();
  function later(action, milliseconds) {
    const timer = setTimeout(() => { timers.delete(timer); action(); }, milliseconds);
    timers.add(timer);
  }
  function observe(notification, label) {
    held.add(notification); // Exclude garbage collection as a difference between paths.
    const received = [];
    for (const event of ["show", "error", "click", "close"]) notification.addEventListener(event, (value) => {
      received.push(event);
      log(`${label}-${event}`, { title: notification.title, message: value.message, trusted: value.isTrusted });
      if (event === "close") held.delete(notification);
    });
    later(() => log(`${label}-after-8s`, { title: notification.title, events: received,
      note: "Record whether a banner or Notification Center entry was actually visible." }), 8000);
  }
  function createNative(label, args) {
    log(`${label}-construct`, { title: args[0], optionKeys: Object.keys(args[1] ?? {}), options: args[1] });
    try {
      const notification = Reflect.construct(Native, args);
      log(`${label}-returned`, { title: notification.title }); observe(notification, label);
      return notification;
    } catch (error) { log(`${label}-threw`, failure(error)); throw error; }
  }
  function interactions(container, Constructor, create) {
    const controls = document.createElement("details");
    controls.innerHTML = `<summary>Click / navigation tests</summary>
      <p>Choose a behavior, send, switch to another app, then click the notification.
      Sending waits six seconds so the original button click's activation can expire.</p>
      <select id="behavior">
        <option value="default">Default focus</option>
        <option value="prevent">preventDefault only</option>
        <option value="open">window.open</option>
        <option value="prevent-open">preventDefault + window.open (MDN example)</option>
        <option value="navigate">navigate option (run last; may replace this tab)</option>
      </select><button id="interaction-send">Send interaction test in 6s</button>
      <button id="direct-open">Control: open from this button</button>
      <p id="interaction-state"></p>`;
    container.append(controls);
    const features = { properties: Constructor ? Object.getOwnPropertyNames(Constructor.prototype).sort() : [],
      maxActions: Constructor?.maxActions, navigate: Boolean(Constructor && "navigate" in Constructor.prototype) };
    log("notification-features", features);
    const status = controls.querySelector("#interaction-state");
    const reportStatus = (text) => { status.textContent = text; };
    const open = (token) => {
      try {
        const popup = window.open(`${config.base}/popup?token=${encodeURIComponent(token)}`, "_blank");
        log("popup-returned", { token, nonNull: popup !== null });
        reportStatus(popup ? "Window returned; confirm the destination actually loaded." : "window.open returned null (blocked).");
      } catch (error) { log("popup-threw", failure(error)); reportStatus(error.message); }
    };
    controls.querySelector("#direct-open").onclick = () => open(title("direct-button"));
    controls.querySelector("#interaction-send").onclick = async () => {
      try {
        if (!Constructor) throw new Error("Notification is unavailable.");
        if (Constructor.permission !== "granted" && await Constructor.requestPermission() !== "granted") {
          reportStatus("Permission was not granted."); return;
        }
        const behavior = controls.querySelector("#behavior").value;
        const token = title(`${isHost ? "native" : "bridge"} ${behavior}`);
        reportStatus("Sending in six seconds. Switch to another app, then click the notification.");
        later(() => {
          const options = behavior === "navigate" ? { navigate: `${config.base}/popup?token=${encodeURIComponent(token)}` } : {};
          log("interaction-construct", { token, behavior, options });
          try {
            const notice = create(token, options);
            log("interaction-returned", { token, navigate: notice.navigate });
            notice.addEventListener("click", (event) => {
              if (behavior.startsWith("prevent")) event.preventDefault();
              log("interaction-click", { token, behavior, defaultPrevented: event.defaultPrevented, trusted: event.isTrusted });
              if (behavior === "open" || behavior === "prevent-open") open(token);
              else reportStatus("Click received. Record whether the test tab was focused or the destination opened.");
            });
            notice.addEventListener("error", (event) => reportStatus(event.message || "Notification error; see report."));
            reportStatus("Notification created. Click it, then record the visible result.");
          } catch (error) { log("interaction-threw", { token, ...failure(error) }); reportStatus(`${error.name}: ${error.message}`); }
        }, 6000);
      } catch (error) { log("interaction-failed", failure(error)); reportStatus(error.message); }
    };
  }
  if (isHost && Native) {
    window.Notification = new Proxy(Native, {
      construct(_target, args) {
        lastOptions = args[1];
        if (panel) panel.querySelector("#replay").disabled = false;
        return createNative("bridge-native", args);
      },
      get(target, key) {
        if (key !== "requestPermission") return Reflect.get(target, key, target);
        return (...args) => {
          log("bridge-native-permission-request");
          try {
            return target.requestPermission(...args).then((permission) => {
              log("bridge-native-permission-result", { permission }); return permission;
            }, (error) => { log("bridge-native-permission-rejected", failure(error)); throw error; });
          } catch (error) { log("bridge-native-permission-threw", failure(error)); throw error; }
        };
      },
    });
  }
  window.addEventListener("error", (event) => { if (event.message) log("uncaught-error", { message: event.message }); });
  window.addEventListener("unhandledrejection", (event) => log("unhandled-rejection", failure(event.reason)));
  document.addEventListener("visibilitychange", () => log("visibility"));
  for (const event of ["focus", "blur"]) window.addEventListener(event, () => log(event));
  window.addEventListener("message", ({ data }) => {
    if (typeof data?.notificationDisplayPopup === "string") log("popup-loaded", { token: data.notificationDisplayPopup });
  });
  window.addEventListener("pagehide", () => { for (const timer of timers) clearTimeout(timer); });

  window.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (!isHost) {
      const app = document.getElementById("display-app");
      if (!app) return;
      app.innerHTML = `<h2>B. Production bridge</h2><p>Each button requests permission if needed, then creates a notification.</p>
        <button id="minimal">B: Send title only</button><button id="example">C: Send example options</button>
        <label><input id="delay" type="checkbox"> Wait five seconds after permission, so I can switch tabs</label>
        <p id="state"></p>`;
      for (const [id, options] of [["minimal", undefined], ["example", { body: "A test message", tag: "example-message", requireInteraction: true }]]) {
        app.querySelector(`#${id}`).onclick = async () => {
          const label = id === "minimal" ? "B bridge minimal" : "C bridge example";
          log("document-send-click", { label });
          try {
            if (Notification.permission !== "granted") {
              log("document-permission-request");
              const permission = await Notification.requestPermission();
              log("document-permission-result", { permission });
            }
            app.querySelector("#state").textContent = `Permission: ${Notification.permission}`;
            const send = () => {
              try {
                log("document-construct", { label, options });
                const notification = new Notification(title(label), options);
                log("document-returned", { title: notification.title }); observe(notification, "document");
              } catch (error) { log("document-threw", failure(error)); }
            };
            if (app.querySelector("#delay").checked) later(send, 5000); else send();
          } catch (error) { log("document-request-failed", failure(error)); }
        };
      }
      app.querySelector("#state").textContent = `Initial permission: ${window.Notification?.permission ?? "unavailable"}`;
      interactions(app, window.Notification, (title, options) => {
        const notice = new Notification(title, options); observe(notice, "document"); return notice;
      });
      log("document-ready"); return;
    }
    panel = document.createElement("section");
    panel.innerHTML = `<style>
      #display-panel {font:14px/1.4 system-ui;padding:12px;box-sizing:border-box;background:Canvas;color:CanvasText;border-bottom:1px solid GrayText}
      #display-panel h1 {font-size:20px;margin:0 0 8px} #display-panel p {margin:6px 0}
      #display-panel button,#display-panel textarea {font:inherit;margin:3px;padding:5px}
      #display-panel textarea {display:block;width:98%;box-sizing:border-box}
      #display-panel pre {white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto}
      #display-panel a {color:LinkText}
      </style><h1>Notification display: ${config.native ? "no kernel" : "native vs production bridge"}</h1>
      <p>Test A, then B below. A calls the original native constructor with <strong>only a title</strong>. Permission alone is not evidence of display.</p>
      <button id="raw">A: Native title only</button><button id="replay" disabled>D: Replay bridge options natively</button>
      <label><input id="native-delay" type="checkbox"> Delay native display five seconds</label>
      <p>After B/C, D reuses the exact options received by the host. ${config.native ? '<a href="/?display=bridge">Bridge comparison</a>' : '<a href="/?display=native">Optional: native-only page without any kernel</a>'}</p>
      <textarea rows="2" placeholder="What did you see? A/B/C/D: banner, Notification Center only, or nothing? Any difference after switching tabs?"></textarea>
      <button id="download">Download report</button><button id="close">Close test notifications</button>
      <details><summary id="count">Events</summary><pre id="events"></pre></details>`;
    panel.id = "display-panel";
    document.body.prepend(panel);
    interactions(panel, Native, (title, options) => createNative("control-interaction", [title, options]));
    const root = document.querySelector("sw-transclude");
    if (root) new ResizeObserver(() => {
      const height = panel.getBoundingClientRect().height;
      root.style.top = `${height}px`; root.style.height = `calc(100dvh - ${height}px)`;
    }).observe(panel);
    async function sendNative(replay) {
      log("control-click", { replay });
      try {
        if (!Native) throw new Error("Native Notification is unavailable.");
        if (Native.permission !== "granted") {
          log("control-permission-request");
          log("control-permission-result", { permission: await Native.requestPermission() });
        }
        const args = replay ? [title("D native replay"), lastOptions] : [title("A native minimal")];
        const send = () => { try { createNative(replay ? "control-replay" : "control-minimal", args); } catch { /* Recorded above. */ } };
        if (panel.querySelector("#native-delay").checked) later(send, 5000); else send();
      } catch (error) { log("control-failed", failure(error)); }
    }
    panel.querySelector("#raw").onclick = () => sendNative(false);
    panel.querySelector("#replay").onclick = () => sendNative(true);
    panel.querySelector("#close").onclick = () => { for (const notice of held) notice.close(); held.clear(); log("explicit-close"); };
    panel.querySelector("#download").onclick = () => {
      const report = { version: 1, config, userAgent: navigator.userAgent, secure: isSecureContext,
        state: state(), notes: panel.querySelector("textarea").value, entries };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `notification-display-${config.native ? "native" : "bridge"}-${Date.now()}.json`;
      link.click(); later(() => URL.revokeObjectURL(url), 1000);
    };
    log("host-ready", { nativeSupported: Boolean(Native), secure: isSecureContext });
  }, 0), { once: true });
  if (isHost) window.addEventListener("message", ({ data }) => {
    if (data?.notificationDisplay === true) record(data.entry);
  });
})();
