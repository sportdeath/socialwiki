import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Manual only: builds current kernel source, serves loopback, never launches a browser.
const instrument = await readFile(new URL("instrument.js", import.meta.url), "utf8");
const app = await readFile(new URL("app.html", import.meta.url), "utf8");
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../../../src/init.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "text" },
  // This vanilla test document doesn't import packages through the kernel import map.
  define: { KERNEL_IMPORT_MAP: JSON.stringify({ imports: {} }) },
  banner: { js: instrument },
});
const kernel = bundle.outputFiles[0].text;
const kernelSha256 = createHash("sha256").update(kernel).digest("hex");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
let base;
const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/init.js") {
    response.setHeader("Content-Type", "text/javascript"); response.end(kernel); return;
  }
  const url = new URL(request.url, base);
  const variant = ["add-track", "gather-first"].includes(url.searchParams.get("variant"))
    ? url.searchParams.get("variant") : "baseline";
  const depth = url.searchParams.get("depth") === "1" ? 1 : 3;
  const config = JSON.stringify({ variant, depth, kernelSha256 });
  const wrap = (body, nested = false) => `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Media diagnostic</title>
    <script>window.mediaDiagnosticConfig=${config}</script><script src="${base}/init.js"></script>
    <style>${nested ? "html, body {height:100%;margin:0;overflow:hidden} sw-transclude {height:100%}" : "body {font:16px system-ui;margin:24px;padding-bottom:180px} button {padding:8px;margin:4px}"}</style></head><body>${body}</body></html>`;
  let html = wrap(app);
  // Default: real kernel's blob -> srcdoc -> data nesting, including actual Penpal relays.
  for (let i = 1; i < depth; i++) html = wrap(`<sw-transclude id="level-${i}" name="Diagnostic ${i}" srcdoc="${escape(html)}"></sw-transclude>`, true);
  response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(Number(process.env.PROBE_PORT ?? 52179), "127.0.0.1", resolve);
});
base = `http://127.0.0.1:${server.address().port}`;
console.log(`Open ${base} in Firefox. This server does not launch or control browsers. Ctrl+C stops it.`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
