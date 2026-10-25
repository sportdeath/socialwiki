import { expect, it, vi } from "vitest";
import { installAutosizeChild } from "../src/bridges/autosize/child";
import { installAutosizeParent } from "../src/bridges/autosize/parent";
import { AUTOSIZE_MODE_EVENT, AUTOSIZE_SIZE_EVENT } from "../src/bridges/autosize/shared";
import { createEventBridge } from "./events";

it("applies reported size only on the axes selected by the host", () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);
  let consumed = false;
  events.parent.listen((event) => {
    if (event.type === AUTOSIZE_SIZE_EVENT) consumed = event.defaultPrevented;
  });

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });

  expect(consumed).toBe(true);
  expect(element.style.height).toBe("480px");
  expect(element.style.width).toBe("");
  parent.destroy();
});

it("inherits the containing document's autosize mode", () => {
  const outerEvents = createEventBridge();
  const context = installAutosizeChild(outerEvents.child);
  let modeConsumed = false;
  outerEvents.child.listen(AUTOSIZE_MODE_EVENT, (event) => {
    modeConsumed = event.defaultPrevented;
  });
  const innerEvents = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "inherit");
  const parent = installAutosizeParent(element, innerEvents.parent, context);
  innerEvents.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });
  expect(element.style.width).toBe("");
  expect(element.style.height).toBe("");

  outerEvents.parent.send(AUTOSIZE_MODE_EVENT, "height");
  expect(modeConsumed).toBe(true);
  expect(element.style.width).toBe("");
  expect(element.style.height).toBe("480px");

  outerEvents.parent.send(AUTOSIZE_MODE_EVENT, "both");
  expect(element.style.width).toBe("320px");
  expect(element.style.height).toBe("480px");

  outerEvents.parent.send(AUTOSIZE_MODE_EVENT, "off");
  expect(element.style.width).toBe("");
  expect(element.style.height).toBe("");

  outerEvents.parent.send(AUTOSIZE_MODE_EVENT, "width");
  const lateEvents = createEventBridge();
  const lateElement = document.createElement("sw-transclude");
  lateElement.setAttribute("autosize", "inherit");
  const lateParent = installAutosizeParent(lateElement, lateEvents.parent, context);
  lateEvents.child.emit(AUTOSIZE_SIZE_EVENT, { width: 240, height: 180 });
  expect(lateElement.style.width).toBe("240px");
  expect(lateElement.style.height).toBe("");
  lateParent.destroy();
  parent.destroy();
  outerEvents.parent.destroy();
});

it("preserves root overflow on axes the child bridge does not own", () => {
  const rootStyle = document.documentElement.style;
  const original = rootStyle.cssText;
  const events = createEventBridge();
  try {
    rootStyle.removeProperty("overflow-x");
    installAutosizeChild(events.child);
    rootStyle.setProperty("overflow-x", "scroll");

    events.parent.send(AUTOSIZE_MODE_EVENT, "height");
    expect(rootStyle.overflowX).toBe("scroll");
    expect(rootStyle.overflowY).toBe("auto");

    events.parent.send(AUTOSIZE_MODE_EVENT, "both");
    expect(rootStyle.overflowX).toBe("auto");
    events.parent.send(AUTOSIZE_MODE_EVENT, "off");
    expect(rootStyle.overflowX).toBe("scroll");
  } finally {
    rootStyle.cssText = original;
    events.parent.destroy();
  }
});

it("applies the latest reported size when autosize is enabled later", async () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });
  expect(element.style.height).toBe("");

  element.setAttribute("autosize", "height");
  await vi.waitFor(() => expect(element.style.height).toBe("480px"));
  expect(element.style.width).toBe("");
  parent.destroy();
});

it("sends the mode after the child reports a size and when it changes", async () => {
  const events = createEventBridge();
  const modes: unknown[] = [];
  events.child.listen(AUTOSIZE_MODE_EVENT, (event) => modes.push(event.detail));
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "both");
  const parent = installAutosizeParent(element, events.parent);

  expect(modes).toEqual([]);
  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });
  expect(modes).toEqual(["both"]);

  element.setAttribute("autosize", "height");
  await vi.waitFor(() => expect(modes).toEqual(["both", "height"]));
  parent.destroy();
});

it("preserves explicit dimensions while autosizing is off", () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.style.cssText = "width: 75%; height: 100vh";
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });
  expect(element.style.width).toBe("75%");
  expect(element.style.height).toBe("100vh");
  parent.destroy();
  expect(element.style.height).toBe("100vh");
});

it("restores author sizing when switching axes, disabling, or destroying autosize", async () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.style.cssText = "width: 75%; height: 100vh !important";
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);
  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });
  expect(element.style.height).toBe("480px");
  expect(element.style.width).toBe("75%");

  element.setAttribute("autosize", "width");
  await vi.waitFor(() => expect(element.style.width).toBe("320px"));
  expect(element.style.height).toBe("100vh");
  expect(element.style.getPropertyPriority("height")).toBe("important");

  element.removeAttribute("autosize");
  await vi.waitFor(() => expect(element.style.width).toBe("75%"));
  element.setAttribute("autosize", "both");
  await vi.waitFor(() => expect(element.style.height).toBe("480px"));
  parent.destroy();
  expect(element.style.width).toBe("75%");
  expect(element.style.height).toBe("100vh");
  expect(element.style.getPropertyPriority("height")).toBe("important");
});

it("applies measured height without changing an author's minimum", async () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.style.minHeight = "180px";
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 240, height: 80 });
  expect(element.style.height).toBe("80px");
  expect(element.style.minHeight).toBe("180px");

  element.setAttribute("autosize", "width");
  await vi.waitFor(() => expect(element.style.height).toBe(""));
  expect(element.style.minHeight).toBe("180px");
  parent.destroy();
});

it("bounds repeated host growth and restarts after a host-controlled mode change", async () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height: 100 });
  for (let height = 120; height <= 900; height += 20) {
    events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height });
  }
  expect(element.style.height).toBe("760px");

  element.removeAttribute("autosize");
  await vi.waitFor(() => expect(element.style.height).toBe(""));
  element.setAttribute("autosize", "height");
  await vi.waitFor(() => expect(element.style.height).toBe("900px"));

  parent.destroy();
});

it("bounds exponentially growing reports by total movement", () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);

  for (const height of [100, 220, 460, 940, 1900, 3820, 7660]) {
    events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height });
  }
  expect(element.style.height).toBe("4196px");

  parent.destroy();
});

it("leaves a large late page with a usable bounded viewport", () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height: 1 });
  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height: 10000 });
  expect(element.style.height).toBe("4097px");
  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 200, height: 12000 });
  expect(element.style.height).toBe("4097px");

  parent.destroy();
});

it("remeasures body content after resize, DOM changes, and shrinkage", async () => {
  const events = createEventBridge();
  const heights: number[] = [];
  events.parent.listen((event) => {
    if (event.type === AUTOSIZE_SIZE_EVENT) {
      heights.push((event.detail as { height: number }).height);
    }
  });

  let viewport = 300;
  let contentHeight = 400;
  const doc = document.documentElement;
  const originalStyle = doc.style.cssText;
  const oldClientHeight = Object.getOwnPropertyDescriptor(doc, "clientHeight");
  const oldScrollHeight = Object.getOwnPropertyDescriptor(document.body, "scrollHeight");
  Object.defineProperty(doc, "clientHeight", { configurable: true, get: () => viewport });
  Object.defineProperty(document.body, "scrollHeight", { configurable: true, get: () => contentHeight });
  const content = document.createElement("div");
  document.body.append(content);

  let notifyResize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });

  try {
    installAutosizeChild(events.child);
    events.parent.send(AUTOSIZE_MODE_EVENT, "height");
    await vi.waitFor(() => expect(heights.at(-1)).toBe(400));

    viewport = 400;
    contentHeight = 450;
    notifyResize();
    await vi.waitFor(() => expect(heights.at(-1)).toBe(450));

    viewport = 450;
    contentHeight = 900;
    window.dispatchEvent(new Event("resize"));
    content.append("Unrelated resize-handler text");
    notifyResize();
    await vi.waitFor(() => expect(heights.at(-1)).toBe(900));
    expect(doc.style.overflowY).toBe("auto");

    content.append("Late content");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(heights.at(-1)).toBe(900);

    contentHeight = 200;
    notifyResize();
    await vi.waitFor(() => expect(heights.at(-1)).toBe(200));
    contentHeight = 900;
    content.append("Growth after a shrink");
    await vi.waitFor(() => expect(heights.at(-1)).toBe(900));
  } finally {
    content.remove();
    doc.style.cssText = originalStyle;
    if (oldClientHeight) Object.defineProperty(doc, "clientHeight", oldClientHeight);
    else Reflect.deleteProperty(doc, "clientHeight");
    if (oldScrollHeight) Object.defineProperty(document.body, "scrollHeight", oldScrollHeight);
    else Reflect.deleteProperty(document.body, "scrollHeight");
    vi.unstubAllGlobals();
    events.parent.destroy();
  }
});
