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
    const resolve = createDefaultResolver(kernelUrl, Promise.resolve("window.kernel = true;"));

    await expect(resolve(src)).resolves.toEqual({
      srcdoc: '<html><head><script>window.kernel = true;</script></head><body><h1>View</h1></body></html>',
      query,
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://social.wiki/view/index.html",
    );
  });
  it("injects the containing kernel into the local View lens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '<html><head><script src="../init.js"></script></head><body>Local View</body></html>',
    )));
    const result = await createDefaultResolver(
      "http://localhost:5173/init-test.js", Promise.resolve("window.localKernel = true;"),
    )("mypage");
    expect(result.srcdoc).toContain('<script>window.localKernel = true;</script>');
    expect(result.srcdoc).not.toContain('src="https://social.wiki/init.js"');
    expect(result.query).toBe("?/mypage");
  });

  it("preserves unrelated URLs and resolves resources against the response URL", async () => {
    const response = new Response(`<html><head>
      <script vite-ignore src="../init.js"></script>
      <link rel="icon" href="./icon.svg">
      <script src="./helper.js"></script>
      </head><body><p>http://localhost:5173/init.js</p></body></html>`);
    Object.defineProperty(response, "url", { value: "https://cdn.example/view/index.html" });
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const result = await createDefaultResolver(
      "http://localhost:5173/init.js", Promise.resolve("window.kernel = true;"),
    )("mypage");
    const document = new DOMParser().parseFromString(result.srcdoc, "text/html");
    expect(document.scripts[0].text).toBe("window.kernel = true;");
    expect(document.scripts[0].hasAttribute("src")).toBe(false);
    expect(document.scripts[1].src).toBe("https://cdn.example/view/helper.js");
    expect(document.querySelector("link")!.href).toBe("https://cdn.example/view/icon.svg");
    expect(document.querySelector("p")!.textContent).toBe("http://localhost:5173/init.js");
  });
});
