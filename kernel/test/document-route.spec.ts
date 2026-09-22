import { describe, expect, it } from "vitest";
import {
  childDocumentRoute,
  queryDocumentRoute,
  resolveChildNavigation,
} from "../src/bridges/navigation/document-route";

describe("document routes", () => {
  it.each([
    [
      "a page with no query",
      "v?/mypage",
      "?/something",
      "v?/mypage?/something",
    ],
    [
      "a lens",
      "v",
      "?/other",
      "v?/other",
    ],
    [
      "a root browser",
      "",
      "?/h?/mypage",
      "h?/mypage",
    ],
    [
      "an embedded browser",
      "e?/browser",
      "?/h?/mypage",
      "e?/browser?/h?/mypage",
    ],
  ])("materializes a relative link from %s", (
    _description,
    documentAddress,
    to,
    expected,
  ) => {
    expect(
      queryDocumentRoute(to, {
        rootUrl: "https://social.wiki/",
        address: documentAddress,
      }),
    ).toEqual({ rootUrl: "https://social.wiki/", address: expected });
  });

  it.each([
    [
      "a side transclusion",
      "",
      undefined,
      null,
    ],
    [
      "a transparent wrapper",
      "v?/mypage",
      "",
      "v?/mypage",
    ],
    [
      "a noncanonical child address",
      "",
      "v",
      null,
    ],
    [
      "an explicit child query",
      "v",
      "?/mypage",
      "v?/mypage",
    ],
    [
      "a versioned page",
      "v",
      "?version=media-id/mypage",
      "v?version=media-id/mypage",
    ],
    [
      "an absolute child route",
      "h?/mypage",
      "#/v?version=media-id/mypage",
      "v?version=media-id/mypage",
    ],
  ])("derives the document route for %s", (
    _description,
    parentAddress,
    route,
    expected,
  ) => {
    const result = childDocumentRoute(
      { rootUrl: "https://social.wiki/", address: parentAddress },
      route,
    );
    expect(result).toEqual(
      expected === null
        ? null
        : { rootUrl: "https://social.wiki/", address: expected },
    );
  });

  it("roots an absolute child route at the configured site", () => {
    expect(
      childDocumentRoute(
        {
          rootUrl: "https://social.wiki/",
          queryRootUrl: "https://example.com/browser.html",
          address: "h?/mypage",
        },
        "#/v?/standalone",
      ),
    ).toEqual({
      rootUrl: "https://social.wiki/",
      address: "v?/standalone",
    });
  });

  it.each([
    ["a transparent relative link", "", "?/test", "?/test"],
    [
      "a transparent external link",
      "",
      "https://example.com/",
      "https://example.com/",
    ],
    ["a noncanonical route", "home", "?/test", null],
    ["a canonical relative route", "?/home", "?/test", "?/home?/test"],
    [
      "a relative page whose name begins with a root marker",
      "?/#/page",
      "?/test",
      "?/#/page?/test",
    ],
    [
      "a parameterized route",
      "?version=object-url/page",
      "?/test",
      "?version=object-url/page?/test",
    ],
    ["a routed root link", "?/home", "#/v?/other", "#/v?/other"],
    [
      "an absolute route",
      "#/v?version=object-url/page",
      "?/test",
      "#/v?version=object-url/page?/test",
    ],
  ])("resolves navigation from %s", (_description, route, to, expected) => {
    expect(resolveChildNavigation(route, to)).toBe(expected);
  });
});
