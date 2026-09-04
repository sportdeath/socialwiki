import { expect, it } from "vitest";
import { installNavigationChild } from "../src/bridges/navigation/child";
import {
  NAVIGATE_EVENT,
  QUERY_EVENT,
} from "../src/bridges/navigation/shared";
import { createEventBridge } from "./events";

it("exposes coherent query state and navigates only on local changes", () => {
  const events = createEventBridge();
  const emitted: Array<{ eventName: string; payload: unknown }> = [];
  events.parent.listen((eventName, payload) => {
    emitted.push({ eventName, payload });
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

  for (const event of changeEvents) window.removeEventListener(event, record);
});
