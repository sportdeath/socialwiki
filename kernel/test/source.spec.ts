import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceFromElement, validateSource } from "../src/bridges/source";

afterEach(() => vi.unstubAllGlobals());

describe("shared permission source identities", () => {
  it("uses a stable UUID when the element has no explicit ID", () => {
    const randomUUID = vi.fn(() => "random-uuid");
    vi.stubGlobal("crypto", { randomUUID });
    const element = document.createElement("div");
    expect(sourceFromElement(element).id).toBe("random-uuid");
    expect(sourceFromElement(element).id).toBe("random-uuid");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    element.id = "explicit";
    expect(sourceFromElement(element).id).toBe("explicit");
  });
  it("uses cryptographic randomness when a data frame lacks randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (values: Uint32Array) => {
      values.set([10, 20, 30, 40]); return values;
    } });
    const element = document.createElement("div");
    expect(sourceFromElement(element).id).toBe("10-20-30-40");
  });
  it("accepts valid deep paths without imposing an arbitrary depth limit", () => {
    const source = Array.from({ length: 150 }, (_, id) => ({ id: String(id), name: "Page" }));
    expect(validateSource(source)).toEqual(source);
    expect(() => validateSource([{ id: 2, name: "Page" }])).toThrow(TypeError);
  });
});
