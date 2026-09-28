import { describe, expect, it } from "vitest";
import {
  childDocumentRoute,
  resolveChildNavigation,
} from "../src/bridges/navigation/document-route";
import { serializeRouteUrl } from "../src/bridges/navigation/route-serialization";

describe("route URL serialization", () => {
  const rootRoute = { rootUrl: "https://social.wiki/", queryPrefix: "" };

  it("serializes internal links without changing external links", () => {
    expect(serializeRouteUrl("#/v?/日本語", rootRoute)?.href).toBe(
      "https://social.wiki/#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(serializeRouteUrl("#/v?/100%20real", rootRoute)?.href).toBe(
      "https://social.wiki/#/v?/100%2520real",
    );
    expect(serializeRouteUrl("#/e?/😄/%F0", rootRoute)?.hash).toBe(
      "#/e?/%F0%9F%98%84/%25F0",
    );
    expect(
      serializeRouteUrl("https://example.com/#/日本語", rootRoute),
    ).toBeNull();
    // Copied absolute links are already URL encoded, even at this root.
    expect(
      serializeRouteUrl("https://social.wiki/#/v?/Cr%C3%A8me", rootRoute),
    ).toBeNull();
    expect(
      serializeRouteUrl("https://social.wiki/#?room=id/Cr%C3%A8me", rootRoute),
    ).toBeNull();
  });

  it("appends relative queries to the current decoded document route", () => {
    const documentRoute = {
      rootUrl: "https://social.wiki/",
      queryPrefix: "?/v?/mypage",
    };
    expect(serializeRouteUrl("?/something", documentRoute)?.href).toBe(
      "https://social.wiki/#/v?/mypage?/something",
    );
    expect(serializeRouteUrl("?/something", {
      ...documentRoute,
      queryPrefix: "?room=id/v",
    })?.href).toBe("https://social.wiki/#?room=id/v?/something");
  });

  it("keeps ancestor parameters when a child follows a relative link", () => {
    const to = resolveChildNavigation("?room=id/v", "?/second");
    expect(to).toBe("?room=id/v?/second");
    expect(serializeRouteUrl(to!, rootRoute)?.href).toBe(
      "https://social.wiki/#?room=id/v?/second",
    );
  });

  it.each([
    ["?/", "?/next"],
    ["?room=id", "?/next"],
    ["?room=id/child", "?/next"],
    ["#/", "?room=id"],
    ["#?room=id/child", "?/next"],
  ])("prepares and follows the same URL for route %s", (route, to) => {
    const parent = {
      rootUrl: "https://social.wiki/",
      queryRootUrl: "https://example.com/browser.html",
      queryPrefix: "?/v",
    };
    const child = childDocumentRoute(parent, route);
    const forwarded = resolveChildNavigation(route, to);
    expect(child).not.toBeNull();
    expect(forwarded).not.toBeNull();
    expect(serializeRouteUrl(to, child!)?.href).toBe(
      serializeRouteUrl(forwarded!, parent)?.href,
    );
  });

  it("uses separate roots for query-relative and explicit root routes", () => {
    const documentRoute = {
      rootUrl: "https://social.wiki/",
      queryRootUrl: "https://example.com/apps/browser.html",
      queryPrefix: "",
    };

    expect(serializeRouteUrl("?/v?/Social.Wiki", documentRoute)?.href).toBe(
      "https://example.com/apps/browser.html#/v?/Social.Wiki",
    );
    expect(serializeRouteUrl("?room=id", documentRoute)?.href).toBe(
      "https://example.com/apps/browser.html#?room=id",
    );
    expect(serializeRouteUrl("#?room=id", documentRoute)?.href).toBe(
      "https://social.wiki/#?room=id",
    );
    expect(serializeRouteUrl("#?room=id/日本語", documentRoute)?.href).toBe(
      "https://social.wiki/#?room=id/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(serializeRouteUrl("?room=id/日本語", documentRoute)?.href).toBe(
      "https://example.com/apps/browser.html#?room=id/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(serializeRouteUrl("#/v?/Social.Wiki", documentRoute)?.href).toBe(
      "https://social.wiki/#/v?/Social.Wiki",
    );
    expect(serializeRouteUrl("#?room=id", {
      ...documentRoute,
      rootUrl: "https://example.com/apps/browser.html",
    })?.href).toBe("https://example.com/apps/browser.html#?room=id");
  });
});
