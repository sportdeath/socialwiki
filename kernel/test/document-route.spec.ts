import { describe, expect, it } from "vitest";
import {
  childDocumentRoute,
  resolveChildNavigation,
} from "../src/bridges/navigation/document-route";

describe("document routes", () => {
  it.each([
    [
      "a page with no query",
      "?/v?/mypage",
      "?/something",
      "?/v?/mypage?/something",
    ],
    [
      "a lens",
      "?/v",
      "?/other",
      "?/v?/other",
    ],
    [
      "a root browser",
      "",
      "?/h?/mypage",
      "?/h?/mypage",
    ],
    [
      "a parameterized root browser",
      "?room=id/v",
      "?/mypage",
      "?room=id/v?/mypage",
    ],
    [
      "an embedded browser",
      "?/e?/browser",
      "?/h?/mypage",
      "?/e?/browser?/h?/mypage",
    ],
  ])("materializes a relative link from %s", (
    _description,
    queryPrefix,
    to,
    expected,
  ) => {
    expect(
      childDocumentRoute({
        rootUrl: "https://social.wiki/",
        queryPrefix,
      }, to),
    ).toEqual({ rootUrl: "https://social.wiki/", queryPrefix: expected });
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
      "?/v?/mypage",
      "",
      "?/v?/mypage",
    ],
    [
      "a noncanonical child address",
      "",
      "v",
      null,
    ],
    [
      "a parameterized child of the root",
      "",
      "?room=id/v",
      "?room=id/v",
    ],
    ["a root query without a child", "", "?room=id", ""],
    ["an empty root address", "", "?/", ""],
    ["a nested query without a child", "?/v", "?room=id", "?/v"],
    [
      "an explicit child query",
      "?/v",
      "?/mypage",
      "?/v?/mypage",
    ],
    [
      "a versioned page",
      "?/v",
      "?version=media-id/mypage",
      "?/v?version=media-id/mypage",
    ],
    [
      "an absolute child route",
      "?/h?/mypage",
      "#/v?version=media-id/mypage",
      "?/v?version=media-id/mypage",
    ],
    ["a rooted browser", "?/h?/mypage", "#/", ""],
    ["a rooted browser with parameters", "?/h?/mypage", "#?room=id", ""],
  ])("derives the document route for %s", (
    _description,
    parentPrefix,
    route,
    expected,
  ) => {
    const result = childDocumentRoute(
      { rootUrl: "https://social.wiki/", queryPrefix: parentPrefix },
      route,
    );
    expect(result).toEqual(
      expected === null
        ? null
        : { rootUrl: "https://social.wiki/", queryPrefix: expected },
    );
  });

  it("roots an absolute child route at the configured site", () => {
    expect(
      childDocumentRoute(
        {
          rootUrl: "https://social.wiki/",
          queryRootUrl: "https://example.com/browser.html",
          queryPrefix: "?/h?/mypage",
        },
        "#/v?/standalone",
      ),
    ).toEqual({
      rootUrl: "https://social.wiki/",
      queryPrefix: "?/v?/standalone",
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
    [
      "a rooted parameterized route",
      "#?room=id/v",
      "?/test",
      "#?room=id/v?/test",
    ],
    ["a routed root link", "?/home", "#/v?/other", "#/v?/other"],
    ["a relative link from the root", "#/", "?/test", "#/test"],
    ["parameters from the root", "#/", "?room=id", "#?room=id"],
    ["a relative link from a rooted browser", "#?room=id", "?/test", "#/test"],
    ["a relative link from an empty root address", "?/", "?/test", "?/test"],
    ["a relative link from root parameters", "?room=id", "?/test", "?/test"],
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
