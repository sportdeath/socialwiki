import { expect, it, vi } from "vitest";
import { installAutosizeParent } from "../src/bridges/autosize/parent";
import { AUTOSIZE_SIZE_EVENT } from "../src/bridges/autosize/shared";
import { createEventBridge } from "./events";

it("applies reported size only on the axes selected by the host", () => {
  const events = createEventBridge();
  const element = document.createElement("sw-transclude");
  element.setAttribute("autosize", "height");
  const parent = installAutosizeParent(element, events.parent);

  events.child.emit(AUTOSIZE_SIZE_EVENT, { width: 320, height: 480 });

  expect(element.style.height).toBe("480px");
  expect(element.style.width).toBe("");
  parent.destroy();
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
