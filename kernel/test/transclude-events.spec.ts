import { afterAll, afterEach, expect, it, vi } from "vitest";
import type { ParentBridgeEndpointInstaller } from "../src/bridges/parent";
import { handleNavigation } from "../src/bridges/navigation/shared";
import { defineTranscludeElement } from "../src/transclude/element";

// Supply events at the frame boundary without loading an actual child document.
// Match a sandboxed lens's origin so frames use srcdoc instead of blob URLs.
vi.stubGlobal("origin", "null");
afterAll(() => vi.unstubAllGlobals());
const receivers = new WeakMap<HTMLElement, Parameters<ParentBridgeEndpointInstaller>[2]>();
defineTranscludeElement(vi.fn(), (host, _iframe, receive) => {
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
