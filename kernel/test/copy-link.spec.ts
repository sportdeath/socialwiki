import { expect, it, vi } from "vitest";
import { installNavigationChild } from "../src/bridges/navigation/child";
import { QUERY_EVENT } from "../src/bridges/navigation/shared";
import { createEventBridge } from "./events";

it("copies the same public URLs that route links expose", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  try {
    const events = createEventBridge();
    installNavigationChild(events.child);

    await expect(window.copyLink("?/next")).rejects.toThrow("public document route");
    expect(writeText).not.toHaveBeenCalled();
    expect(await window.copyLink("https://example.com/invite")).toBe(
      "https://example.com/invite",
    );

    events.parent.send(QUERY_EVENT, {
      query: "?/current",
      documentRoute: {
        rootUrl: "https://social.wiki/",
        queryRootUrl: "https://example.com/browser.html",
        queryPrefix: "?room=id/v",
      },
    });

    expect(await window.copyLink("?/next")).toBe(
      "https://example.com/browser.html#?room=id/v?/next",
    );
    expect(await window.copyLink("#/v?/Crème")).toBe(
      "https://social.wiki/#/v?/Cr%C3%A8me",
    );
    expect(await window.copyLink("#?room=other/v")).toBe(
      "https://social.wiki/#?room=other/v",
    );
    const copiedUrl = "https://social.wiki/#/v?/Cr%C3%A8me";
    expect(await window.copyLink(copiedUrl)).toBe(copiedUrl);
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([
      "https://example.com/invite",
      "https://example.com/browser.html#?room=id/v?/next",
      copiedUrl,
      "https://social.wiki/#?room=other/v",
      copiedUrl,
    ]);

    await expect(window.copyLink("#section")).rejects.toThrow();
    await expect(window.copyLink("javascript:alert(1)")).rejects.toThrow(
      "Only HTTP(S)",
    );
    expect(writeText).toHaveBeenCalledTimes(5);

    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    await expect(window.copyLink("?/next")).rejects.toThrow("Clipboard denied");
  } finally {
    if (previousClipboard) {
      Object.defineProperty(navigator, "clipboard", previousClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  }
});
