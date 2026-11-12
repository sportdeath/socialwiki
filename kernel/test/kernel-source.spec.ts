import { describe, expect, it } from "vitest";
import { findKernelScript, inlineKernel } from "../src/transclude/kernel-source";
const url = "https://social.wiki/init.js";
const tag = `<script src="${url}"></script>`;
function apply(html: string, source = "window.example = 1;") {
  const span = findKernelScript(html, url);
  return span ? inlineKernel(html, span, url, source) : html;
}
describe("kernel source delivery", () => {
  it("changes only the eligible script span, preserving the rest byte for byte", () => {
    const before = '<!DOCTYPE html>\n<!-- script sample -->\n<html lang="en"><head><meta title="a > b"><title>A &amp; B</title><style>p{color:red}</style>';
    const after = '<noscript><p>Keep this exactly</p></noscript><textarea>' + tag + '</textarea>\n<!-- ' + tag + ' -->';
    const result = apply(before + tag + after);
    expect(result.startsWith(before)).toBe(true);
    expect(result.endsWith(after)).toBe(true);
    expect(result).toContain(`data-kernel-url="${url}"`);
    expect(result).toContain("window.example = 1;");
  });
  it("preserves route metadata and quoted source URLs", () => {
    const result = apply(`<script data-document-route='#/' src='${url}' data-share-kernel></script>`);
    const parsed = new DOMParser().parseFromString(result, "text/html");
    expect(parsed.scripts[0].getAttribute("data-document-route")).toBe("#/");
    expect(parsed.scripts[0].hasAttribute("src")).toBe(false);
  });
  it.each(["async", "defer", 'type="module"', 'integrity="sha256-abc"', 'nonce="abc"', 'onload="ready()"', "nomodule", 'crossorigin="anonymous"'])("retains external loading for %s", attribute => {
    const html = `<script ${attribute} src="${url}"></script>`;
    expect(apply(html)).toBe(html);
  });
  it.each([
    `<meta http-equiv="Content-Security-Policy" content="script-src https:">${tag}`,
    `${tag}<meta content="script-src https:" http-equiv="Content&#45;Security-Policy">`,
    `<!-- http-equiv example -->${tag}`,
    `<noscript>${tag}</noscript>`, `<textarea>${tag}</textarea>`,
    `<template>${tag}</template>`, `<script>const sample = '${tag}'</script>`,
    `<body>${tag}`, `<script src="https://other.example/init.js"></script>${tag}`,
    `<script src="${url}">ignored external fallback text</script>`,
  ])("leaves ineligible or policy-constrained documents unchanged", html => {
    expect(apply(html)).toBe(html);
  });
  it.each(['const x = "</script>";', 'String.raw`<!-- <script>`;'])("keeps custom runtime raw-text semantics", source => {
    expect(apply(tag, source)).toBe(tag);
  });
  it("does not select a script hidden in comments or quoted attributes", () => {
    const html = `<!-- ${tag} --><meta name='${tag}'>${tag}`;
    const span = findKernelScript(html, url)!;
    expect(html.slice(span.start, span.end)).toBe(tag);
    expect(span.start).toBe(html.lastIndexOf(tag));
  });
});
