import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultResolver } from "../src/bridges/resolution/default";

describe("default document resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["alice", "?/alice"],
    ["mypage?/myquery", "?/mypage?/myquery"],
    ["😄", "?/😄"],
    ["100%20real", "?/100%20real"],
    ["?version=media-id/alice", "?version=media-id/alice"],
  ])("delegates %s to the packaged View lens", async (src, query) => {
    const kernelUrl = "https://social.wiki/init.js";
    const fetch = vi.fn(async () => new Response(
      "<html><head><script src=\"../init.js\"></script></head><body><h1>View</h1></body></html>",
    ));
    vi.stubGlobal("fetch", fetch);
    const resolve = createDefaultResolver(kernelUrl);

    await expect(resolve(src)).resolves.toEqual({
      srcdoc: `<html><head><script src="${kernelUrl}"></script></head><body><h1>View</h1></body></html>`,
      query,
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://social.wiki/view/index.html",
    );
  });
});
