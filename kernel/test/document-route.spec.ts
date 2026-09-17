import { describe, expect, it } from "vitest";
import {
  childDocumentRoute,
  queryDocumentRoute,
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
      "a transparent wrapper",
      "",
      "?/v?/mypage",
      "?/v?/mypage",
      "",
    ],
    [
      "the Browser's View lens",
      "",
      "?/v?/mypage",
      "?/mypage",
      "v",
    ],
    [
      "View's displayed page",
      "v",
      "?/mypage",
      "",
      "v?/mypage",
    ],
    [
      "a versioned page",
      "v",
      "?version=media-id/mypage",
      "",
      "v?version=media-id/mypage",
    ],
  ])("derives the document route for %s", (
    _description,
    parentAddress,
    parentQuery,
    childQuery,
    expected,
  ) => {
    expect(
      childDocumentRoute(
        { rootUrl: "https://social.wiki/", address: parentAddress },
        parentQuery,
        childQuery,
      ),
    ).toEqual({ rootUrl: "https://social.wiki/", address: expected });
  });
});
