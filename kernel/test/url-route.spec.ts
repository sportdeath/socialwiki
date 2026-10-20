import { describe, expect, it } from "vitest";
import { composeAddress, composeQuery } from "../src/route";
import {
  canReplaceRouteHistory,
  decodeUrlAddress,
  decodeUrlQuery,
  encodeUrlAddress,
  encodeUrlQuery,
} from "../src/url-route";

describe("top-level URL routes", () => {
  it("round trips encoded names throughout a nested address", () => {
    const address = composeAddress(
      "e",
      composeQuery(
        new URLSearchParams({ draft: "<h1>Hello</h1>\n" }),
        composeAddress("日本語", composeQuery(undefined, "Crème brûlée")),
      ),
    );

    expect(decodeUrlAddress(encodeUrlAddress(address))).toBe(address);
    expect(encodeUrlAddress(address)).toContain(
      "%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(encodeUrlAddress(address)).toContain(
      "Cr%C3%A8me%20br%C3%BBl%C3%A9e",
    );
  });

  it("leaves malformed percent encoding intact", () => {
    expect(decodeUrlAddress("v?/%not-encoded")).toBe("v?/%not-encoded");
  });

  it("round trips names containing percent-escape-like text", () => {
    const address = "v?/100%20real/%2F/%25";
    expect(decodeUrlAddress(encodeUrlAddress(address))).toBe(address);
  });

  it("round trips root queries while preserving native fragments", () => {
    expect(encodeUrlQuery("?room=id")).toBe("#?room=id");
    expect(decodeUrlQuery("#?room=id")).toBe("?room=id");
    expect(decodeUrlQuery(encodeUrlQuery("?/"))).toBe("?/");
    expect(encodeUrlQuery("?/v?/日本語")).toBe("#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E");
    expect(encodeUrlQuery("?room=id/v?/日本語")).toBe(
      "#?room=id/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(decodeUrlQuery("#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E")).toBe("?/v?/日本語");
    expect(decodeUrlQuery("#?room=id/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E")).toBe(
      "?room=id/v?/日本語",
    );
    expect(decodeUrlQuery("#section")).toBeUndefined();
    expect(decodeUrlQuery("#")).toBeUndefined();
  });

  it("replaces history for parameter changes at any route depth", () => {
    const base = "https://social.wiki/";
    const replaces = (from: string, to: string) =>
      canReplaceRouteHistory(new URL(from, base), new URL(to, base));

    expect(replaces("#/v?/site", "#?mode=compact/v?/site")).toBe(true);
    expect(replaces("#/e?draft=old/site", "#/e?draft=new/site")).toBe(true);
    expect(replaces("#/v?/site?sort=old/inbox", "#/v?/site?sort=new/inbox")).toBe(true);
    expect(replaces("#/v?/site?sort=old", "#/v?/site?sort=new")).toBe(true);

    expect(replaces("#/v?/site?/inbox", "#/v?/site?/message")).toBe(false);
    expect(replaces("#/v?/site", "#/v?/other-site")).toBe(false);
    expect(replaces("#/v?/site", "#/e?/site")).toBe(false);
    expect(replaces("#/v?/site", "#/v?/site?/inbox")).toBe(false);
  });

  it("only replaces routes within the current page", () => {
    const current = new URL("https://example.com/wiki?theme=dark#/v?/site");
    expect(canReplaceRouteHistory(
      current,
      new URL("https://example.com/wiki?theme=dark#/v?version=2/site"),
    )).toBe(true);
    expect(canReplaceRouteHistory(
      current,
      new URL("https://example.com/other?theme=dark#/v?version=2/site"),
    )).toBe(false);
    expect(canReplaceRouteHistory(
      current,
      new URL("https://example.com/wiki?theme=light#/v?version=2/site"),
    )).toBe(false);
    expect(canReplaceRouteHistory(
      current,
      new URL("https://other.example/wiki?theme=dark#/v?version=2/site"),
    )).toBe(false);
    expect(canReplaceRouteHistory(
      current,
      new URL("https://example.com/wiki?theme=dark#section"),
    )).toBe(false);
  });
});
