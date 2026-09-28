import { describe, expect, it } from "vitest";
import { composeAddress, composeQuery } from "../src/route";
import {
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
});
