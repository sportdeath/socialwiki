import { afterEach, expect, it, vi } from "vitest";
import { TranscludeFrame, useDataUrlForNestedFrame } from "../src/transclude/frame";
import type { NavigableTransclude } from "../src/bridges/navigation/shared";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("uses data URLs only for nested WebKit frames", () => {
  const chrome = "Mozilla/5.0 AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36";
  const firefox = "Mozilla/5.0 Gecko/20100101 Firefox/145.0";
  const safari = "Mozilla/5.0 AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15";
  const iosChrome = "Mozilla/5.0 AppleWebKit/605.1.15 CriOS/153.0.0.0 Mobile Safari/604.1";
  expect(useDataUrlForNestedFrame("about:srcdoc", chrome)).toBe(false);
  expect(useDataUrlForNestedFrame("data:text/html,hello", chrome)).toBe(false);
  expect(useDataUrlForNestedFrame("about:srcdoc", firefox)).toBe(false);
  expect(useDataUrlForNestedFrame("about:srcdoc", safari)).toBe(true);
  expect(useDataUrlForNestedFrame("data:text/html,hello", safari)).toBe(true);
  expect(useDataUrlForNestedFrame("about:srcdoc", iosChrome)).toBe(true);
  expect(useDataUrlForNestedFrame("blob:null/123", safari)).toBe(false);
});

it("waits for bridge metadata before mounting and discards a superseded preparation", async () => {
  vi.stubGlobal("origin", "null");
  const host = document.createElement("div") as unknown as NavigableTransclude;
  document.body.append(host);
  const completions: (() => void)[] = [];
  const install = Object.assign(vi.fn(() => ({ destroy() {}, send() {}, setRoute() {}, setQuery() {} })), {
    prepareFrame: vi.fn((iframe: HTMLIFrameElement) => new Promise<void>((resolve) => {
      completions.push(() => { iframe.name = "prepared"; resolve(); });
    })),
  });
  const frame = new TranscludeFrame(host, install, () => {});
  frame.render({ srcdoc: "First", query: "" });
  frame.render({ srcdoc: "Second", query: "" });
  expect(install).not.toHaveBeenCalled();
  completions[0](); await Promise.resolve(); expect(install).not.toHaveBeenCalled();
  completions[1](); await Promise.resolve();
  expect(install).toHaveBeenCalledOnce();
  expect(install.mock.calls[0][1].name).toBe("prepared");
  frame.render({ srcdoc: "Third", query: "" }); frame.disconnect();
  completions[2](); await Promise.resolve(); expect(install).toHaveBeenCalledOnce();
});

it("still mounts immediately when bridge preparation is synchronous", () => {
  vi.stubGlobal("origin", "null");
  const host = document.createElement("div") as unknown as NavigableTransclude;
  const install = Object.assign(vi.fn(() => ({ destroy() {}, send() {}, setRoute() {}, setQuery() {} })), {
    prepareFrame(iframe: HTMLIFrameElement) { iframe.name = "prepared"; },
  });
  const frame = new TranscludeFrame(host, install, () => {});
  frame.render({ srcdoc: "Synchronous", query: "" });
  expect(install).toHaveBeenCalledOnce();
  expect(install.mock.calls[0][1].name).toBe("prepared");
  frame.disconnect();
});

it("shows preparation failures and recovers on the next render", async () => {
  vi.stubGlobal("origin", "null");
  const host = document.createElement("div") as unknown as NavigableTransclude;
  const attach = vi.spyOn(host, "attachShadow");
  const prepareFrame = vi.fn<() => void | Promise<void>>()
    .mockRejectedValueOnce(new Error("Bootstrap unavailable"))
    .mockImplementationOnce(() => { throw new Error("Synchronous failure"); })
    .mockReturnValueOnce(undefined);
  const install = Object.assign(vi.fn(() => ({ destroy() {}, send() {}, setRoute() {}, setQuery() {} })), { prepareFrame });
  const frame = new TranscludeFrame(host, install, () => {});
  const shadow = attach.mock.results[0].value as ShadowRoot;
  const loading = shadow.querySelector("iframe")!;
  frame.render({ srcdoc: "First", query: "" }); await Promise.resolve();
  expect(loading.srcdoc).toContain("Bootstrap unavailable");
  expect(install).not.toHaveBeenCalled();
  frame.render({ srcdoc: "Second", query: "" });
  expect(loading.srcdoc).toContain("Synchronous failure");
  frame.render({ srcdoc: "Third", query: "" });
  expect(install).toHaveBeenCalledOnce();
  expect(loading.srcdoc).not.toContain("failure");
  expect(loading.srcdoc).not.toContain("Bootstrap unavailable");
  frame.disconnect();
});
