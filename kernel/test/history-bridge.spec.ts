import { afterEach, expect, it, vi } from "vitest";
import { installHistoryChild } from "../src/bridges/history/child";
import { installHistoryParent } from "../src/bridges/history/parent";
import { HISTORY_TRAVERSE_EVENT } from "../src/bridges/history/shared";
import { createDocumentRouteState } from "../src/bridges/navigation/document-route";
import type { NavigableTransclude } from "../src/bridges/navigation/shared";
import { createEventBridge } from "./events";

const methods = ["back", "forward", "go"] as const;
const originalDescriptors = Object.fromEntries(
  methods.map((method) => [method, Object.getOwnPropertyDescriptor(history, method)]),
);

afterEach(() => {
  for (const method of methods) {
    const descriptor = originalDescriptors[method];
    if (descriptor) Object.defineProperty(history, method, descriptor);
    else delete (history as unknown as Record<string, unknown>)[method];
  }
  vi.restoreAllMocks();
});

it("forwards routed back, forward, and go requests from a child", () => {
  const events = createEventBridge();
  const route = createDocumentRouteState();
  const deltas: number[] = [];
  events.parent.listen((event) => {
    if (event.type === HISTORY_TRAVERSE_EVENT) {
      deltas.push((event.detail as { delta: number }).delta);
    }
  });
  const nativeGo = vi.spyOn(history, "go").mockImplementation(() => {});
  installHistoryChild(events.child, route);

  history.back();
  history.forward();
  history.go(-2);
  expect(nativeGo).not.toHaveBeenCalled();
  expect(deltas).toEqual([]);

  route.setDocumentRoute({ rootUrl: "https://social.wiki/", queryPrefix: "?/v?/test" });
  history.back();
  history.forward();
  history.go(-2);
  history.go(-1.8);
  history.go(0);
  expect(deltas).toEqual([-1, 1, -2, -1]);
  expect(nativeGo).toHaveBeenCalledWith(0);
});

it("accepts traversal only from a publicly routed child", () => {
  const events = createEventBridge();
  const route = createDocumentRouteState({
    rootUrl: "https://social.wiki/",
    queryPrefix: "?/v",
  });
  const host = document.createElement("div") as NavigableTransclude;
  const go = vi.spyOn(history, "go").mockImplementation(() => {});
  const stop = installHistoryParent(host, events.parent, route);

  events.child.emit(HISTORY_TRAVERSE_EVENT, { delta: -1 });
  expect(go).not.toHaveBeenCalled();

  host.setAttribute("route", "invalid");
  events.child.emit(HISTORY_TRAVERSE_EVENT, { delta: -1 });
  expect(go).not.toHaveBeenCalled();

  host.setAttribute("route", "");
  events.child.emit(HISTORY_TRAVERSE_EVENT, { delta: -1 });
  events.child.emit(HISTORY_TRAVERSE_EVENT, { delta: 1 });
  expect(go.mock.calls).toEqual([[-1], [1]]);

  for (const delta of [0, 1.5, "-1", Number.MAX_VALUE]) {
    events.child.emit(HISTORY_TRAVERSE_EVENT, { delta });
  }
  expect(go).toHaveBeenCalledTimes(2);
  stop();
});
