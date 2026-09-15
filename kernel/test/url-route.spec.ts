import { describe, expect, it } from "vitest";
import { composeAddress, composeQuery } from "../src/route";
import {
  canonicalRouteUrl,
  decodeUrlAddress,
  encodeUrlAddress,
  resolveAuthoredRoute,
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

  it("canonicalizes internal links without changing external links", () => {
    const base = "https://social.wiki/";
    expect(canonicalRouteUrl("#/v?/日本語", base)?.href).toBe(
      "https://social.wiki/#/v?/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    );
    expect(canonicalRouteUrl("#/v?/100%20real", base)?.href).toBe(
      "https://social.wiki/#/v?/100%2520real",
    );
    expect(canonicalRouteUrl("https://example.com/#/日本語", base)).toBeNull();
  });

  it("round trips names containing percent-escape-like text", () => {
    const address = "v?/100%20real/%2F/%25";
    expect(decodeUrlAddress(encodeUrlAddress(address))).toBe(address);
  });

  it("resolves authored routes without URL-serializing their addresses", () => {
    const route = resolveAuthoredRoute(
      "https://social.wiki/#/e?/😄/%F0",
      "https://social.wiki/",
    );

    expect(route?.address).toBe("e?/😄/%F0");
    expect(route?.url.hash).toBe("#/e?/%F0%9F%98%84/%F0");
  });
});
