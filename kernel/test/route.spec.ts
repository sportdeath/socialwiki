import { describe, expect, it } from "vitest";
import {
  composeAddress,
  composeQuery,
  parseAddress,
  parseQuery,
} from "../src/route";

describe("Social.Wiki routes", () => {
  it.each([
    { name: "v", query: "?/alice" },
    { name: "e", query: "?mode=compact/alice/replies" },
    { name: "history", query: "" },
  ])("round trips $name$query", ({ name, query }) => {
    expect(parseAddress(composeAddress(name, query))).toEqual({ name, query });
  });

  it("round trips query parameters and a nested address", () => {
    const params = new URLSearchParams([
      ["tag", "one"],
      ["tag", "two"],
      ["name", "Alice Smith"],
    ]);
    const address = "v?/alice/replies";

    const parsed = parseQuery(composeQuery(params, address));
    expect(parsed.params?.toString()).toBe(params.toString());
    expect(parsed.address).toBe(address);
  });
});
