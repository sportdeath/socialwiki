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
    expect(rootStyle.overflowY).toBe("hidden");

    events.parent.send(AUTOSIZE_MODE_EVENT, "both");
    expect(rootStyle.overflowX).toBe("hidden");
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
