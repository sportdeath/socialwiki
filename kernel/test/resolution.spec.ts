import { describe, expect, it, vi } from "vitest";
import { installResolutionChild } from "../src/bridges/resolution/child";
import { installResolutionParent } from "../src/bridges/resolution/parent";
import type {
  DocumentResolver,
  ResolvedDocument,
} from "../src/bridges/resolution/shared";
import { createEventBridge } from "./events";

describe("the resolution bridge", () => {
  it("keeps concurrent responses with their requests", async () => {
    const pending = new Map<
      string,
      (document: ResolvedDocument) => void
    >();
    const upstream: DocumentResolver = (src) =>
      new Promise((resolve) => pending.set(src, resolve));
    const events = createEventBridge();
    installResolutionParent(events.parent, upstream);
    const resolve = installResolutionChild(events.child);

    const first = resolve("first");
    const second = resolve("second");
    const firstDocument = {
      srcdoc: "<p>first</p>",
      query: "?/first",
      status: "ok",
    };
    const secondDocument = {
      srcdoc: "<p>second</p>",
      query: "?/second",
      status: "ok",
    };

    await vi.waitFor(() => {
      expect(new Set(pending.keys())).toEqual(new Set(["first", "second"]));
    });
    pending.get("second")!(secondDocument);
    pending.get("first")!(firstDocument);
    await expect(first).resolves.toEqual(firstDocument);
    await expect(second).resolves.toEqual(secondDocument);
  });

  it("returns resolver errors and honors local cancellation", async () => {
    const events = createEventBridge();
    const upstream: DocumentResolver = async (src) => {
      if (src === "missing") throw new Error("Document not found");
      return new Promise(() => {});
    };
    installResolutionParent(events.parent, upstream);
    const resolve = installResolutionChild(events.child);

    await expect(resolve("missing")).rejects.toThrow("Document not found");

    const controller = new AbortController();
    const request = resolve("slow", controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
