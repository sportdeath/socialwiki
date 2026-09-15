import { expect, it, vi } from "vitest";
import { installNavigationChild } from "../src/bridges/navigation/child";
import {
  handleNavigation,
  NAVIGATE_EVENT,
  QUERY_EVENT,
} from "../src/bridges/navigation/shared";
import { createEventBridge } from "./events";

it("exposes coherent query state and navigates only on local changes", () => {
  const events = createEventBridge();
  const emitted: Array<{ eventName: string; payload: unknown }> = [];
  events.parent.listen((event) => {
    emitted.push({ eventName: event.type, payload: event.detail });
  });
  installNavigationChild(events.child);

  const snapshots: Array<{
    event: string;
    query: string;
    params: string;
    address: string | undefined;
  }> = [];
  const changeEvents = ["paramschange", "addresschange", "querychange"];
  const record = (event: Event) => {
    snapshots.push({
      event: event.type,
      query: window.query,
      params: window.params.toString(),
      address: window.address,
    });
  };
  for (const event of changeEvents) window.addEventListener(event, record);

  events.parent.send(QUERY_EVENT, { query: "?mode=compact/alice" });

  expect(snapshots.map(({ event }) => event).sort()).toEqual(
    [...changeEvents].sort(),
  );
  expect(
    snapshots.every(
      ({ query, params, address }) =>
        query === "?mode=compact/alice" &&
        params === "mode=compact" &&
        address === "alice",
    ),
  ).toBe(true);
  expect(emitted.some(({ eventName }) => eventName === NAVIGATE_EVENT)).toBe(
    false,
  );

  window.params.set("sort", "new");
  expect(emitted.filter(({ eventName }) => eventName === NAVIGATE_EVENT)).toEqual(
    [
      {
        eventName: NAVIGATE_EVENT,
        payload: { to: "?mode=compact&sort=new/alice" },
      },
    ],
  );

  const link = document.createElement("a");
  link.setAttribute("href", "#/v?/日本語");
  document.body.append(link);
  const modifierClick = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    metaKey: true,
  });
  link.dispatchEvent(modifierClick);

  expect(modifierClick.defaultPrevented).toBe(false);
  expect(link.href).toContain("#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E");
  expect(
    emitted.filter(({ eventName }) => eventName === NAVIGATE_EVENT),
  ).toHaveLength(1);
  link.remove();

  const percentLink = document.createElement("a");
  percentLink.setAttribute("href", "#/v?/100%20real");
  document.body.append(percentLink);
  percentLink.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
  );
  const percentClick = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  percentLink.dispatchEvent(percentClick);

  expect(percentLink.href).toContain("#/v?/100%2520real");
  expect(
    emitted.filter(({ eventName }) => eventName === NAVIGATE_EVENT).at(-1),
  ).toEqual({
    eventName: NAVIGATE_EVENT,
    payload: { to: "#/v?/100%20real" },
  });
  percentLink.remove();

  const contextLink = document.createElement("a");
  contextLink.setAttribute("href", "#/v?/Crème brûlée");
  document.body.append(contextLink);
  const contextMenu = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
  });
  contextLink.dispatchEvent(contextMenu);

  expect(contextMenu.defaultPrevented).toBe(false);
  expect(contextLink.href).toContain("#/v?/Cr%C3%A8me%20br%C3%BBl%C3%A9e");
  expect(
    emitted.filter(({ eventName }) => eventName === NAVIGATE_EVENT),
  ).toHaveLength(2);
  contextLink.remove();

  const middleLink = document.createElement("a");
  middleLink.setAttribute("href", "#/v?/日本語");
  document.body.append(middleLink);
  const middlePointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 1,
  });
  middleLink.dispatchEvent(middlePointerDown);

  expect(middlePointerDown.defaultPrevented).toBe(false);
  expect(middleLink.href).toContain("#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E");
  middleLink.remove();

  const blankLink = document.createElement("a");
  blankLink.setAttribute("href", "#/v?/日本語");
  blankLink.target = "_blank";
  document.body.append(blankLink);
  let blankPreventedByBridge: boolean | undefined;
  const stopNativeBlankNavigation = (event: Event) => {
    blankPreventedByBridge = event.defaultPrevented;
    event.preventDefault();
  };
  // Registered after the bridge listener, this observes its decision and then
  // suppresses happy-dom's attempt to fetch the new browsing context.
  document.addEventListener("click", stopNativeBlankNavigation);
  const blankClick = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  blankLink.dispatchEvent(blankClick);
  document.removeEventListener("click", stopNativeBlankNavigation);

  expect(blankPreventedByBridge).toBe(false);
  expect(blankLink.href).toContain("#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E");
  blankLink.remove();

  const shadowHost = document.createElement("div");
  const shadow = shadowHost.attachShadow({ mode: "open" });
  const shadowLink = document.createElement("a");
  shadowLink.setAttribute("href", "#/v?/Crème brûlée");
  const shadowChild = document.createElement("span");
  shadowLink.append(shadowChild);
  shadow.append(shadowLink);
  document.body.append(shadowHost);
  const shadowClick = new MouseEvent("click", {
    bubbles: true,
    composed: true,
    cancelable: true,
    metaKey: true,
  });
  shadowChild.dispatchEvent(shadowClick);

  expect(shadowClick.defaultPrevented).toBe(false);
  expect(shadowLink.href).toContain("#/v?/Cr%C3%A8me%20br%C3%BBl%C3%A9e");
  shadowHost.remove();

  for (const event of changeEvents) window.removeEventListener(event, record);
});

it("marks handled navigation so it does not pass through", () => {
  const source = document.createElement("div");
  document.body.append(source);
  const onNavigate = vi.fn();
  const stopHandling = handleNavigation(onNavigate);
  const event = new CustomEvent(NAVIGATE_EVENT, {
    detail: { to: "?/alice" },
    bubbles: true,
    cancelable: true,
  });

  source.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onNavigate).toHaveBeenCalledWith("?/alice", source);

  stopHandling();
  source.remove();
});
