import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const compatibility = await readFile(new URL("../../../../examples/peripheral-compatibility.html", import.meta.url), "utf8");
const app = await readFile(new URL("../../../../examples/filesystem.html", import.meta.url), "utf8");
// Manual only: bundle the production kernel without launching a browser.
const bundle = await build({
  entryPoints: [here("../../../src/init.ts")], bundle: true, write: false, format: "iife", platform: "browser",
  loader: { ".css": "text" }, define: { KERNEL_IMPORT_MAP: JSON.stringify({ imports: {} }) },
});
const kernel = bundle.outputFiles[0].text;
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
let base;
const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*"); response.setHeader("Cache-Control", "no-store");
  if (request.url === "/init.js") { response.setHeader("Content-Type", "text/javascript"); response.end(kernel); return; }
  const wrap = (body) => `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Local file editing</title><style>html, body {height:100%;margin:0;overflow:hidden} sw-transclude {height:100%}</style><script src="${base}/init.js"></script></head><body>${body}</body></html>`;
  const url = new URL(request.url, base);
  const selected = url.searchParams.get("app") === "compatibility" ? compatibility : app;
  let html = selected.replace("http://localhost:5173/init.js", `${base}/init.js`);
  if (url.searchParams.get("depth") !== "1") {
    for (let i = 1; i < 3; i++) html = wrap(`<sw-transclude id="files-${i}" name="File test ${i}" srcdoc="${escape(html)}"></sw-transclude>`);
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject); server.listen(Number(process.env.PROBE_PORT ?? 52180), "127.0.0.1", resolve);
});
base = `http://127.0.0.1:${server.address().port}`;
console.log(`Open ${base} in desktop Chrome. Manual file test only; Ctrl+C stops the server.`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
