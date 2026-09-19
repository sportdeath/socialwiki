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
      "a bare child address",
      "",
      "v",
      "v",
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

  it.each([
    ["an unrouted relative link", undefined, "?/test", null],
    ["an unrouted external link", undefined, "https://example.com/", null],
    ["a transparent relative link", "", "?/test", "?/test"],
    [
      "a transparent external link",
      "",
      "https://example.com/",
      "https://example.com/",
    ],
    ["a bare route", "home", "?/test", "?/home?/test"],
    [
      "a parameterized route",
      "?version=object-url/page",
      "?/test",
      "?version=object-url/page?/test",
    ],
    ["a routed root link", "home", "#/v?/other", "#/v?/other"],
  ])("resolves navigation from %s", (_description, route, to, expected) => {
    expect(resolveChildNavigation(route, to)).toBe(expected);
  });
});
