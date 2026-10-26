import iframeResize from "@iframe-resizer/parent";
import { beforeEach, expect, it, vi } from "vitest";
import { installAutosizeChild } from "../src/bridges/autosize/child";
import { installAutosizeParent } from "../src/bridges/autosize/parent";
import { AUTOSIZE_FALLBACK_EVENT, AUTOSIZE_MODE_EVENT } from "../src/bridges/autosize/shared";
import { createEventBridge } from "./events";

vi.mock("@iframe-resizer/parent", () => ({ default: vi.fn(() => []) }));

beforeEach(() => vi.clearAllMocks());

function setup(mode = "height", initialStyle = "") {
  const events = createEventBridge();
  const host = document.createElement("sw-transclude");
  const iframe = document.createElement("iframe");
  host.style.cssText = initialStyle;
  host.setAttribute("autosize", mode);
  Object.defineProperties(host, {
    clientWidth: { get: () => Number.parseFloat(host.style.width) || 480 },
    clientHeight: { get: () => Number.parseFloat(host.style.height) || 150 },
  });
  const bridge = installAutosizeParent(host, iframe, events.parent);
  const options = vi.mocked(iframeResize).mock.calls.at(-1)?.[0];
  const report = (width: number, height: number) => {
    if (!options?.onResized) throw new Error("Library was not initialized");
    options.onResized({ iframe: iframe as never, width, height, type: "resizeObserver" });
  };
  return { events, host, iframe, bridge, options, report };
}

it("starts the library only for an autosized iframe", async () => {
  const { host, bridge } = setup("off");
  expect(iframeResize).not.toHaveBeenCalled();
  host.setAttribute("autosize", "height");
  await vi.waitFor(() => expect(iframeResize).toHaveBeenCalledOnce());
  bridge.destroy();
});

it("fits only the chosen axis and sends the mode when the library is ready", () => {
  const { events, host, iframe, bridge, options, report } = setup("height");
  const modes: unknown[] = [];
  events.child.listen(AUTOSIZE_MODE_EVENT, (event) => modes.push(event.detail));
  options?.onReady?.(document.createElement("iframe") as never);
  report(320, 480);
  expect(host.style.height).toBe("480px");
  expect(host.style.width).toBe("");
  expect(iframe.getAttribute("scrolling")).toBe("no");
  expect(iframe.style.overflow).toBe("hidden");
  expect(modes).toContain("height");
  bridge.destroy();
});

it("keeps the original inline style when autosize is turned off", async () => {
  const { host, bridge, report } = setup("height");
  report(320, 480);
  host.setAttribute("autosize", "off");
  await vi.waitFor(() => expect(host.style.height).toBe(""));
  bridge.destroy();
});

it("allows one large late update without stopping the library", () => {
  const { host, bridge, report } = setup("height");
  report(480, 1);
  report(480, 10000);
  expect(host.style.height).toBe("10000px");
  report(480, 10500);
  expect(host.style.height).toBe("10500px");
  bridge.destroy();
});

it("returns a viewport-driven page to the containing layout", () => {
  const { host, iframe, bridge, report } = setup("height", "height: 320px");
  for (let i = 0; i < 5; i++) report(480, host.clientHeight + 20);
  expect(host.style.height).toBe("320px");
  expect(iframe.getAttribute("scrolling")).toBe("auto");
  report(480, host.clientHeight + 20);
  expect(host.style.height).toBe("320px");
  report(480, 100);
  expect(iframe.getAttribute("scrolling")).toBe("auto");
  bridge.destroy();
});

it("can autosize again after a fallback is disabled and re-enabled", async () => {
  const { events, host, bridge, report } = setup("height", "height: 320px");
  const modes: unknown[] = [];
  events.child.listen(AUTOSIZE_MODE_EVENT, (event) => modes.push(event.detail));
  for (let i = 0; i < 5; i++) report(480, host.clientHeight + 20);
  expect(host.style.height).toBe("320px");
  host.setAttribute("autosize", "off");
  await vi.waitFor(() => expect(modes).toContain("off"));
  host.setAttribute("autosize", "height");
  await vi.waitFor(() => expect(modes.at(-1)).toBe("height"));
  report(480, 500);
  expect(host.style.height).toBe("500px");
  bridge.destroy();
});

it("returns a shrinking viewport-driven page to the containing layout", () => {
  const { host, iframe, bridge, report } = setup("height", "height: 320px");
  for (let i = 0; i < 7; i++) report(480, host.clientHeight * 0.9);
  expect(host.style.height).toBe("320px");
  expect(iframe.getAttribute("scrolling")).toBe("auto");
  bridge.destroy();
});

it("bounds exponential viewport growth before reaching the emergency cap", () => {
  const { host, bridge, report } = setup("height", "height: 320px");
  for (let i = 0; i < 7; i++) report(480, host.clientHeight * 2 + 20);
  expect(host.style.height).toBe("320px");
  bridge.destroy();
});

it("returns to the containing layout when CSS alternates between two heights", () => {
  const { host, bridge, report } = setup("height");
  report(480, 50);
  report(480, 200);
  report(480, 50);
  report(480, 200);
  expect(host.style.height).toBe("");
  report(480, 50);
  expect(host.style.height).toBe("");
  bridge.destroy();
});

it("uses the containing layout for extreme measurements", () => {
  const { host, iframe, bridge, report } = setup("height");
  report(480, 100000);
  expect(host.style.height).toBe("");
  expect(iframe.getAttribute("scrolling")).toBe("auto");
  bridge.destroy();
});

it("keeps fitting varied late growth", () => {
  const { host, bridge, report } = setup("height");
  report(480, 170);
  report(480, 210);
  report(480, 260);
  report(480, 320);
  expect(host.style.height).toBe("320px");
  bridge.destroy();
});

it("does not stop regularly spaced content growth", () => {
  const { host, bridge, report } = setup("height");
  let time = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => time);
  try {
    for (let height = 100; height <= 900; height += 20) {
      report(480, height);
      time += 60;
    }
    expect(host.style.height).toBe("900px");
  } finally {
    clock.mockRestore();
    bridge.destroy();
  }
});

it("does not mistake rapid content updates for viewport feedback", () => {
  const { host, bridge, report } = setup("height");
  let time = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => time);
  try {
    for (let height = 100; height <= 900; height += 20) {
      report(480, height);
      time += 20;
    }
    expect(host.style.height).toBe("900px");
  } finally {
    clock.mockRestore();
    bridge.destroy();
  }
});

it("lets a nested transclusion inherit later mode changes", async () => {
  const outer = createEventBridge();
  const context = installAutosizeChild(outer.child);
  const inner = createEventBridge();
  const host = document.createElement("sw-transclude");
  const iframe = document.createElement("iframe");
  host.setAttribute("autosize", "inherit");
  const bridge = installAutosizeParent(host, iframe, inner.parent, context);
  expect(iframeResize).not.toHaveBeenCalled();
  outer.parent.send(AUTOSIZE_MODE_EVENT, "height");
  expect(iframeResize).toHaveBeenCalledOnce();
  outer.parent.send(AUTOSIZE_MODE_EVENT, "off");
  await vi.waitFor(() => expect(host.style.height).toBe(""));
  bridge.destroy();
});

it("enables native scrolling only in fallback and restores author overflow", () => {
  const original = document.documentElement.style.cssText;
  const originalBody = document.body.style.cssText;
  const events = createEventBridge();
  try {
    document.documentElement.style.setProperty("overflow-y", "scroll");
    document.body.style.setProperty("overflow-x", "hidden");
    installAutosizeChild(events.child);
    events.parent.send(AUTOSIZE_MODE_EVENT, "height");
    expect(document.documentElement.style.overflowY).toBe("clip");
    expect(document.body.style.overflowX).toBe("clip");
    expect(document.body.style.overflowY).toBe("");
    events.parent.send(AUTOSIZE_FALLBACK_EVENT, { x: false, y: true });
    expect(document.documentElement.style.overflowY).toBe("auto");
    expect(document.body.style.overflowX).toBe("hidden");
    expect(document.body.style.overflowY).toBe("");
    events.parent.send(AUTOSIZE_MODE_EVENT, "off");
    expect(document.documentElement.style.overflowY).toBe("scroll");
  } finally {
    document.documentElement.style.cssText = original;
    document.body.style.cssText = originalBody;
    events.parent.destroy();
  }
});
