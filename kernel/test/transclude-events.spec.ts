import { afterAll, afterEach, expect, it, vi } from "vitest";
import type { ParentBridgeEndpointInstaller } from "../src/bridges/parent";
import { handleNavigation } from "../src/bridges/navigation/shared";
import { defineTranscludeElement } from "../src/transclude/element";

// Supply events at the frame boundary without loading an actual child document.
// Match a sandboxed lens's origin so frames use srcdoc instead of blob URLs.
vi.stubGlobal("origin", "null");
afterAll(() => vi.unstubAllGlobals());
const receivers = new WeakMap<HTMLElement, Parameters<ParentBridgeEndpointInstaller>[2]>();
const resolveDocument = vi.fn(async () => ({
  srcdoc: "<p>Lens</p>",
  query: "",
  status: "loading",
}));
defineTranscludeElement(resolveDocument, (host, _iframe, receive) => {
  receivers.set(host, receive);
  return { destroy() {}, send() {}, setQuery() {} };
});

function transclude() {
  const element = document.createElement("sw-transclude");
  element.setAttribute("srcdoc", "<p>Example</p>");
  document.body.append(element);
  return element;
}

function receive(element: HTMLElement, type: string, detail: unknown) {
  receivers.get(element)!(new CustomEvent(type, {
    detail, bubbles: true, composed: true, cancelable: true,
  }));
}

afterEach(() => document.body.replaceChildren());

it("keeps direct srcdoc as input and reflects uncanceled resolved-lens output", async () => {
  const direct = transclude();
  receive(direct, "sw-lens-output", {
    status: "ok",
    srcdoc: "<p>Nested output</p>",
  });
  expect(direct.getAttribute("srcdoc")).toBe("<p>Example</p>");

  const resolved = document.createElement("sw-transclude");
  resolved.setAttribute("src", "example");
  document.body.append(resolved);
  await vi.waitFor(() => expect(receivers.has(resolved)).toBe(true));

  receive(resolved, "sw-lens-output", {
    status: "ok",
    srcdoc: "<p>Resolved output</p>",
  });
  expect(resolved.getAttribute("status")).toBe("ok");
  expect(resolved.getAttribute("srcdoc")).toBe("<p>Resolved output</p>");
});

it("lets a resolved-lens host prevent output reflection", async () => {
  const element = document.createElement("sw-transclude");
  element.setAttribute("src", "example");
  element.addEventListener("sw-lens-output", (event) => event.preventDefault());
  document.body.append(element);
  await vi.waitFor(() => expect(receivers.has(element)).toBe(true));

  receive(element, "sw-lens-output", {
    status: "ok",
    srcdoc: "<p>Output</p>",
  });
  expect(element.getAttribute("status")).toBe("loading");
  expect(element.hasAttribute("srcdoc")).toBe(false);
});

it("exposes events locally and forwards only when explicitly requested", () => {
  const element = transclude();
  const listen = vi.fn();
  const forward = vi.fn();
  element.addEventListener("example", listen);

  receive(element, "example", { value: 1 });
  expect(listen).toHaveBeenCalledOnce();

  element.onUnhandledEvent = forward;
  receive(element, "example", { value: 2 });
  expect(listen).toHaveBeenCalledTimes(2);
  expect(forward).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: "example", detail: { value: 2 },
  }));

  element.onUnhandledEvent = undefined;
  receive(element, "example", { value: 3 });
  expect(listen).toHaveBeenCalledTimes(3);
  expect(forward).toHaveBeenCalledOnce();
});

it("lets document navigation handlers intercept before generic forwarding", () => {
  const element = transclude();
  element.onUnhandledEvent = vi.fn();
  const navigate = vi.fn();
  const stopHandling = handleNavigation(navigate);
  try {
    receive(element, "sw-navigate", { to: "?/alice" });
    expect(navigate).toHaveBeenCalledWith("?/alice", element);
    expect(element.onUnhandledEvent).not.toHaveBeenCalled();
  } finally {
    stopHandling();
  }
});

it("forwards new event names across transparent boundaries until intercepted", () => {
  const inner = transclude();
  const outer = transclude();
  inner.onUnhandledEvent = ({ type, detail }) => receive(outer, type, detail);
  outer.onUnhandledEvent = vi.fn();
  const listen = vi.fn();
  outer.addEventListener("new-event", listen);

  receive(inner, "new-event", { value: 1 });
  expect(outer.onUnhandledEvent).toHaveBeenCalledOnce();

  outer.addEventListener("new-event", (event) => event.preventDefault());
  receive(inner, "new-event", { value: 2 });
  expect(listen).toHaveBeenCalledTimes(2);
  expect(outer.onUnhandledEvent).toHaveBeenCalledOnce();
});
