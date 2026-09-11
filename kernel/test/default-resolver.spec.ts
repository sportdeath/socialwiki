import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultResolver } from "../src/bridges/resolution/default";

describe("default document resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["v", "view/index.html", "https://social.wiki/init.js"],
    ["e", "edit/index.html", "http://localhost:5173/init.js"],
    ["h", "history/index.html", "https://cdn.example/npm/social-wiki@0.1.0/dist/init.js"],
  ])("resolves the %s lens", async (lens, file, kernelUrl) => {
    const fetch = vi.fn(async () => new Response(
      `<html><head><script src="../init.js"></script></head><body><h1>${lens}</h1></body></html>`,
    ));
    vi.stubGlobal("fetch", fetch);
    const resolve = createDefaultResolver(
      kernelUrl,
      "https://wiki.example/app",
    );

    await expect(resolve(`#/${lens}?/alice`)).resolves.toEqual({
      srcdoc: `<html><head><script src="${kernelUrl}"></script></head><body><h1>${lens}</h1></body></html>`,
      query: "?/alice",
      status: "loading",
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      new URL(file, kernelUrl).href,
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
