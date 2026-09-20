import instrument from "./browser/notifications/display.js?raw";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
async function setup() {
  vi.useFakeTimers();
  const calls: unknown[][] = [];
  const notices: Native[] = [];
  class Native extends EventTarget {
    static permission = "granted";
    static fail = false;
    static requestPermission = vi.fn(async () => "granted");
    close = vi.fn();
    constructor(public title: string, options?: unknown) {
      super(); calls.push([...arguments]);
      if (Native.fail) throw new TypeError("Native failure");
      notices.push(this);
    }
  }
  const host = Object.assign(new EventTarget(), { Notification: Native,
    open: vi.fn(() => ({})),
    notificationDisplayConfig: { native: false, base: "http://127.0.0.1:52181" }, top: null as unknown });
  host.top = host;
  runInNewContext(instrument, { window: host, document, navigator, isSecureContext: true,
    Date, Math, setTimeout, clearTimeout, URL, Blob });
  host.dispatchEvent(new Event("DOMContentLoaded")); await vi.advanceTimersByTimeAsync(0);
  return { host, Native, calls, notices, events: () => document.querySelector("#events")!.textContent! };
}

it("records the real adapter arguments unchanged, while the native control passes only a title", async () => {
  const s = await setup();
  const options = { body: "Example", silent: null, vibrate: undefined };
  const notification = new s.host.Notification("Bridge", options);
  expect(s.calls[0][1]).toBe(options);
  expect(notification).toBeInstanceOf(s.Native);
  (document.querySelector("#raw") as HTMLButtonElement).click();
  expect(s.calls[1]).toHaveLength(1);
  (document.querySelector("#replay") as HTMLButtonElement).click();
  expect(s.calls[2][1]).toBe(options);
  expect(s.Native.requestPermission).not.toHaveBeenCalled();
  expect(notification.close).not.toHaveBeenCalled();
});

it("distinguishes constructor failure, native events, and an eight-second observation", async () => {
  const s = await setup();
  s.Native.fail = true;
  expect(() => new s.host.Notification("Failure")).toThrow("Native failure");
  expect(s.events()).toContain("bridge-native-threw");
  s.Native.fail = false;
  const notification = new s.host.Notification("Visible?");
  notification.dispatchEvent(new Event("show"));
  expect(s.events()).toContain("bridge-native-show");
  await vi.advanceTimersByTimeAsync(8000);
  expect(s.events()).toContain("bridge-native-after-8s");
  expect(s.events()).toContain('"events":["show"]');
  expect(notification.close).not.toHaveBeenCalled();
});

it("tests the MDN click pattern after old activation expires, and records an actual popup load separately", async () => {
  const s = await setup();
  (document.querySelector("#behavior") as HTMLSelectElement).value = "prevent-open";
  (document.querySelector("#interaction-send") as HTMLButtonElement).click();
  expect(s.calls).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(6000);
  expect(s.calls).toHaveLength(1); expect(s.host.open).not.toHaveBeenCalled();
  const click = new Event("click", { cancelable: true });
  s.notices[0].dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(s.host.open).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1:52181/popup?token="), "_blank");
  expect(s.events()).toContain("popup-returned");
  expect(s.events()).not.toContain("popup-loaded");
  s.host.dispatchEvent(new MessageEvent("message", { data: { notificationDisplayPopup: "test-token" } }));
  expect(s.events()).toContain("popup-loaded");
});

it("passes navigate to the native control unchanged and does not emulate navigation with a click handler", async () => {
  const s = await setup();
  (document.querySelector("#behavior") as HTMLSelectElement).value = "navigate";
  (document.querySelector("#interaction-send") as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(6000);
  expect(s.calls[0][1]).toEqual({ navigate: expect.stringContaining("http://127.0.0.1:52181/popup?token=") });
  s.notices[0].dispatchEvent(new Event("click"));
  expect(s.host.open).not.toHaveBeenCalled();
});
