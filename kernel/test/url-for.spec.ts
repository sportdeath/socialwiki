import { expect, it } from "vitest";
import { installNavigationChild } from "../src/bridges/navigation/child";
import { QUERY_EVENT } from "../src/bridges/navigation/shared";
import { createEventBridge } from "./events";

it("returns the same public URLs that route links expose", () => {
  const events = createEventBridge();
  installNavigationChild(events.child);

  expect(() => window.urlFor("?/next")).toThrow("document context");
  expect(window.urlFor("https://example.com/invite")).toBe(
    "https://example.com/invite",
  );

  events.parent.send(QUERY_EVENT, {
    query: "?/current",
    documentRoute: {
      rootUrl: "https://social.wiki/",
      queryRootUrl: "https://example.com/browser.html",
      queryPrefix: "?room=id/v",
    },
  });

  expect(window.urlFor("?/next")).toBe(
    "https://example.com/browser.html#?room=id/v?/next",
  );
  expect(window.urlFor("#/v?/Crème")).toBe(
    "https://social.wiki/#/v?/Cr%C3%A8me",
  );
  expect(window.urlFor("#?room=other/v")).toBe(
    "https://social.wiki/#?room=other/v",
  );
  expect(window.urlFor("https://social.wiki/#/v?/Cr%C3%A8me")).toBe(
    "https://social.wiki/#/v?/Cr%C3%A8me",
  );

  expect(() => window.urlFor("#section")).toThrow();
  expect(() => window.urlFor("javascript:alert(1)")).toThrow(
    "Only HTTP(S)",
  );
});

it("uses the current public route after it changes", () => {
  const events = createEventBridge();
  installNavigationChild(events.child);

  events.parent.send(QUERY_EVENT, {
    query: "?/current",
    documentRoute: {
      rootUrl: "https://social.wiki/",
      queryRootUrl: "https://cscwmeta.org/",
      queryPrefix: "",
    },
  });
  expect(window.urlFor("?/program/42")).toBe(
    "https://cscwmeta.org/#/program/42",
  );

  events.parent.send(QUERY_EVENT, {
    query: "?/current",
    documentRoute: {
      rootUrl: "https://social.wiki/",
      queryRootUrl: "https://elsewhere.example/",
      queryPrefix: "?/v?/cscw.meta",
    },
  });
  expect(window.urlFor("?/program/42")).toBe(
    "https://elsewhere.example/#/v?/cscw.meta?/program/42",
  );
});
