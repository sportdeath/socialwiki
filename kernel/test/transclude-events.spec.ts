import { afterAll, afterEach, expect, it, vi } from "vitest";
import type { ParentBridgeEndpointInstaller } from "../src/bridges/parent";
import { handleDefaultNavigation } from "../src/bridges/navigation/default";
import {
  dispatchNavigation,
  handleNavigation,
  type NavigableTransclude,
  NAVIGATE_EVENT,
} from "../src/bridges/navigation/shared";
import {
  defineTranscludeElement,
  type TranscludeElement,
} from "../src/transclude/element";

// Supply events at the frame boundary without loading an actual child document.
// Match a sandboxed lens's origin so frames use srcdoc instead of blob URLs.
vi.stubGlobal("origin", "null");
afterAll(() => vi.unstubAllGlobals());
const receivers = new WeakMap<HTMLElement, Parameters<ParentBridgeEndpointInstaller>[2]>();
const receivedQueries = new WeakMap<HTMLElement, ReturnType<typeof vi.fn>>();
const receivedRoutes = new WeakMap<HTMLElement, ReturnType<typeof vi.fn>>();
const resolveDocument = vi.fn(async (src: string) => ({
  srcdoc: "<p>Lens</p>",
  query: src.startsWith("?") ? src : `?/${src}`,
}));
defineTranscludeElement(
  resolveDocument,
  (host, _iframe, receive) => {
    receivers.set(host, receive);
    const setQuery = vi.fn();
    const setRoute = vi.fn();
    receivedQueries.set(host, setQuery);
    receivedRoutes.set(host, setRoute);
    return { destroy() {}, send() {}, setQuery, setRoute };
  },
);

function transclude() {
  const element = document.createElement("sw-transclude");
  element.setAttribute("srcdoc", "<p>Example</p>");
  document.body.append(element);
  return element;
}

function receive(element: TranscludeElement, type: string, detail: unknown) {
  const event = new CustomEvent(type, {
    detail, bubbles: true, composed: true, cancelable: true,
  });
  if (type === NAVIGATE_EVENT && typeof detail === "object" && detail !== null) {
    const { to } = detail as Record<string, unknown>;
    if (typeof to === "string") {
      event.preventDefault();
      dispatchNavigation(to, element, () =>
        handleDefaultNavigation(element, to),
      );
    }
  }
  if (!event.defaultPrevented) receivers.get(element)!(event);
}

afterEach(() => document.body.replaceChildren());

it("distinguishes absent, empty, and explicit routes", () => {
  const element = transclude();
  const setRoute = receivedRoutes.get(element)!;

  expect(setRoute).toHaveBeenLastCalledWith(undefined);
  element.setAttribute("route", "");
  expect(setRoute).toHaveBeenLastCalledWith("");
  element.setAttribute("route", "?/home");
  expect(setRoute).toHaveBeenLastCalledWith("?/home");
  element.removeAttribute("route");
  expect(setRoute).toHaveBeenLastCalledWith(undefined);
});

it("keeps srcdoc as input and exposes lens output only as an event", async () => {
  const direct = transclude();
  receive(direct, "sw-lens-output", {
    status: "ok",
    srcdoc: "<p>Nested output</p>",
  });
  expect(direct.getAttribute("srcdoc")).toBe("<p>Example</p>");

  const resolved = document.createElement("sw-transclude");
  resolved.setAttribute("src", "example");
  const onOutput = vi.fn();
  resolved.addEventListener("sw-lens-output", onOutput);
  document.body.append(resolved);
  await vi.waitFor(() => expect(receivers.has(resolved)).toBe(true));

  const output = {
    status: "ok",
    srcdoc: "<p>Resolved output</p>",
  };
  receive(resolved, "sw-lens-output", output);
  expect(onOutput).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ detail: output }),
  );
  expect(resolved.hasAttribute("status")).toBe(false);
  expect(resolved.hasAttribute("srcdoc")).toBe(false);
});

it("exposes events locally and forwards only when explicitly requested", () => {
  const element = transclude();
  expect(() => element.send("click")).toThrow(
    'Bridged event names must start with "sw-"',
  );

  const listen = vi.fn();
  const forward = vi.fn();
  element.addEventListener("sw-example", listen);

  receive(element, "sw-example", { value: 1 });
  expect(listen).toHaveBeenCalledOnce();

  element.onUnhandledEvent = forward;
  receive(element, "sw-example", { value: 2 });
  expect(listen).toHaveBeenCalledTimes(2);
  expect(forward).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: "sw-example", detail: { value: 2 },
  }));

  element.onUnhandledEvent = undefined;
  receive(element, "sw-example", { value: 3 });
  expect(listen).toHaveBeenCalledTimes(3);
  expect(forward).toHaveBeenCalledOnce();
});

it("lets document navigation handlers replace the transclusion default", () => {
  const element = transclude();
  element.setAttribute("route", "?/home");
  element.onUnhandledEvent = vi.fn();
  const navigate = vi.fn((to: string, transclude: NavigableTransclude) => {
    transclude.navigate(to);
  });
  const stopHandling = handleNavigation(navigate);
  try {
    receive(element, "sw-navigate", { to: "?/alice" });
    expect(navigate).toHaveBeenCalledWith("?/alice", element);
    expect(element.getAttribute("query")).toBe("?/alice");
    expect(element.onUnhandledEvent).not.toHaveBeenCalled();
  } finally {
    stopHandling();
  }
});

it("applies only unhandled relative navigation within the transclusion", async () => {
  const resolved = document.createElement("sw-transclude");
  resolved.setAttribute("src", "Social.Wiki");
  document.body.append(resolved);
  await vi.waitFor(() => expect(receivers.has(resolved)).toBe(true));
  const resolutionsBeforeNavigation = resolveDocument.mock.calls.length;

  receive(resolved, "sw-navigate", { to: "?/something" });
  expect(resolved.getAttribute("src")).toBe("?/Social.Wiki?/something");
  await vi.waitFor(() =>
    expect(resolveDocument).toHaveBeenCalledTimes(
      resolutionsBeforeNavigation + 1,
    ),
  );
  expect(receivedQueries.get(resolved)).toHaveBeenLastCalledWith(
    "?/Social.Wiki?/something",
  );

  receive(resolved, "sw-navigate", { to: "#/v?/pinkcord" });
  receive(resolved, "sw-navigate", { to: "https://example.com/" });
  expect(resolved.getAttribute("src")).toBe("?/Social.Wiki?/something");
  expect(receivedQueries.get(resolved)).toHaveBeenCalledTimes(2);

  const direct = transclude();
  direct.navigate("?/something");
  expect(direct.getAttribute("query")).toBe("?/something");
  expect(() => direct.navigate("#/v?/elsewhere")).toThrow(
    'Local transclusion navigation must start with "?"',
  );

  resolved.setAttribute("src", "OtherPage");
  await vi.waitFor(() => {
    expect(resolveDocument).toHaveBeenCalledTimes(
      resolutionsBeforeNavigation + 2,
    );
  });

  const versioned = document.createElement("sw-transclude");
  versioned.setAttribute("src", "?version=media-id/internal-name?/old");
  document.body.append(versioned);
  await vi.waitFor(() => expect(receivers.has(versioned)).toBe(true));
  receive(versioned, "sw-navigate", { to: "?/new" });
  expect(versioned.getAttribute("src")).toBe(
    "?version=media-id/internal-name?/new",
  );
});

it("uses route as the default for navigation out of a transclusion", () => {
  const originalNavigate = window.navigate;
  const navigate = vi.fn();
  window.navigate = navigate;
  try {
    const routed = transclude();
    routed.setAttribute("route", "?version=object-url/page");
    receive(routed, "sw-navigate", { to: "?/test" });
    receive(routed, "sw-navigate", { to: "https://example.com/" });

    expect(navigate.mock.calls).toEqual([
      ["?version=object-url/page?/test"],
      ["https://example.com/"],
    ]);
    expect(routed.getAttribute("query")).toBeNull();

    const transparent = transclude();
    transparent.setAttribute("route", "");
    receive(transparent, "sw-navigate", { to: "?/other" });
    expect(navigate).toHaveBeenLastCalledWith("?/other");

    const absolute = transclude();
    absolute.setAttribute("route", "#/v?version=object-url/page");
    receive(absolute, "sw-navigate", { to: "?/absolute" });
    expect(navigate).toHaveBeenLastCalledWith(
      "#/v?version=object-url/page?/absolute",
    );
  } finally {
    window.navigate = originalNavigate;
  }
});

it("forwards new event names across transparent boundaries until intercepted", () => {
  const inner = transclude();
  const outer = transclude();
  inner.onUnhandledEvent = ({ type, detail }) => receive(outer, type, detail);
  outer.onUnhandledEvent = vi.fn();
  const listen = vi.fn();
  outer.addEventListener("sw-new-event", listen);

  receive(inner, "sw-new-event", { value: 1 });
  expect(outer.onUnhandledEvent).toHaveBeenCalledOnce();

  outer.addEventListener("sw-new-event", (event) => event.preventDefault());
  receive(inner, "sw-new-event", { value: 2 });
  expect(listen).toHaveBeenCalledTimes(2);
  expect(outer.onUnhandledEvent).toHaveBeenCalledOnce();
});
