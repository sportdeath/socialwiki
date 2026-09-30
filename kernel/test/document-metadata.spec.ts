import { expect, it, vi } from "vitest";
import { installDocumentMetadataChild } from "../src/bridges/document-metadata/child";
import { serializeDocument } from "../src/bridges/resolution/document";
import {
  applyDocumentMetadata,
  isDocumentMetadata,
  normalizeDocumentIcon,
  readDocumentMetadata,
  DOCUMENT_METADATA_EVENT,
} from "../src/bridges/document-metadata/shared";

it("accepts only absolute HTTPS and image data icons", () => {
  expect(normalizeDocumentIcon("https://example.com/icon.svg")).toBe("https://example.com/icon.svg");
  expect(normalizeDocumentIcon("data:image/svg+xml,%3Csvg/%3E")).toBe("data:image/svg+xml,%3Csvg/%3E");
  expect(normalizeDocumentIcon("data:image/avif;base64,AA==")).toBe("data:image/avif;base64,AA==");
  for (const href of ["icon.svg", "/icon.svg", "http://example.com/icon.png", "blob:null/icon", "data:,", "data:text/html,hello"]) {
    expect(normalizeDocumentIcon(href)).toBeNull();
  }
  expect(isDocumentMetadata({ title: "Page", icon: "/icon.svg" })).toBe(false);
});

it("reads a document's title and icon without resolving relative icons", () => {
  const page = document.implementation.createHTMLDocument("Article");
  page.title = "Article";
  const relative = page.createElement("link");
  relative.rel = "icon";
  relative.href = "icon.png";
  page.head.append(relative);
  expect(readDocumentMetadata(page)).toEqual({ title: "Article", icon: null });

  const absolute = page.createElement("link");
  absolute.rel = "icon";
  absolute.href = "https://example.com/icon.png";
  page.head.append(absolute);
  expect(readDocumentMetadata(page)).toEqual({
    title: "Article", icon: "https://example.com/icon.png",
  });
});

it("resolves icon URLs alongside other resources before sandboxing", () => {
  const page = document.implementation.createHTMLDocument("Portable");
  const icon = page.createElement("link");
  icon.rel = "icon";
  icon.setAttribute("href", "./icon.svg");
  const base = page.createElement("base");
  base.setAttribute("href", "./assets/");
  page.head.append(icon, base);

  const html = serializeDocument(page, "https://example.com/site/index.html");
  expect(html).toContain('rel="icon" href="https://example.com/site/icon.svg"');
  expect(html).toContain('href="https://example.com/site/assets/"');
});

it("promotes selected metadata and restores the document's own icon", () => {
  const page = document.implementation.createHTMLDocument("Container");
  const ownIcon = page.createElement("link");
  ownIcon.rel = "icon";
  ownIcon.href = "https://example.com/default.svg";
  // The top-level host starts with a clean head and no copied title.
  page.head.replaceChildren(ownIcon);

  applyDocumentMetadata({ title: "Article", icon: "https://example.com/article.svg" }, "Fallback", page);
  expect(readDocumentMetadata(page)).toEqual({
    title: "Article", icon: "https://example.com/article.svg",
  });

  applyDocumentMetadata({ title: "", icon: null }, "Fallback", page);
  expect(readDocumentMetadata(page)).toEqual({
    title: "Fallback", icon: "https://example.com/default.svg",
  });
  expect(page.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
});

it("reports initial and dynamic title and icon changes", async () => {
  const previousTitle = document.title;
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = "https://example.com/first.svg";
  document.head.append(icon);
  document.title = "First";
  const emit = vi.fn();
  const bridge = installDocumentMetadataChild({ emit });
  window.dispatchEvent(new Event("load"));
  expect(emit).toHaveBeenLastCalledWith(DOCUMENT_METADATA_EVENT, {
    title: "First", icon: "https://example.com/first.svg",
  });

  document.title = "Second";
  icon.href = "data:image/png;base64,AA==";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(emit).toHaveBeenLastCalledWith(DOCUMENT_METADATA_EVENT, {
    title: "Second", icon: "data:image/png;base64,AA==",
  });

  icon.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(emit).toHaveBeenLastCalledWith(DOCUMENT_METADATA_EVENT, {
    title: "Second", icon: null,
  });

  bridge.destroy();
  document.title = previousTitle;
});
