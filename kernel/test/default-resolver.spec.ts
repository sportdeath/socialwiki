import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultResolver } from "../src/bridges/resolution/default";

describe("default document resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["v", "view.html"],
    ["e", "edit.html"],
    ["h", "history.html"],
  ])("resolves the %s lens", async (lens, file) => {
    const fetch = vi.fn(async () => new Response(`<h1>${lens}</h1>`));
    vi.stubGlobal("fetch", fetch);
    const resolve = createDefaultResolver(
      "https://kernel.example",
      "https://wiki.example/app",
    );

    await expect(resolve(`#/${lens}?/alice`)).resolves.toEqual({
      srcdoc: `<h1>${lens}</h1>`,
      query: "?/alice",
      status: "loading",
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      `https://kernel.example/${file}`,
    );
  });

  it("rejects an unknown lens without fetching it", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const resolve = createDefaultResolver(
      "https://kernel.example",
      "https://wiki.example/app",
    );

    await expect(resolve("#/unknown?/alice")).rejects.toThrow(
      "Unrecognized lens: unknown",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
