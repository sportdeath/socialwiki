import { describe, expect, it } from "vitest";
import { serializeRouteUrl } from "../src/bridges/navigation/route-serialization";

describe("route URL serialization", () => {
  const rootRoute = { rootUrl: "https://social.wiki/", address: "" };

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
  });

  it("appends relative queries to the current decoded document route", () => {
    const documentRoute = {
      rootUrl: "https://social.wiki/",
      address: "v?/mypage",
    };
    expect(serializeRouteUrl("?/something", documentRoute)?.href).toBe(
      "https://social.wiki/#/v?/mypage?/something",
    );
  });
});
