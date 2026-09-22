import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// One manual runner for the real adapters: no browser driver, native API mocks,
// instrumentation, or alternate adapter registry.
const examples = new Map(await Promise.all([
  ["geolocation", "geolocation.html"], ["media", "media.html"],
  ["filesystem", "filesystem.html"], ["notifications", "notifications.html"],
  ["compatibility", "peripheral-compatibility.html"],
].map(async ([name, file]) => [name, await readFile(new URL(`../../../../examples/${file}`, import.meta.url), "utf8")])));
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../../../src/init.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", platform: "browser",
  loader: { ".css": "text" }, define: { KERNEL_IMPORT_MAP: JSON.stringify({ imports: {} }) },
});
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
let base;
const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");
  const url = new URL(request.url, base);
  if (url.pathname === "/init.js") {
    response.setHeader("Content-Type", "text/javascript"); response.end(outputFiles[0].text); return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (url.pathname === "/") {
    response.end(`<!doctype html><meta charset="UTF-8"><meta name="color-scheme" content="light dark">
      <title>Peripheral examples</title><style>body {font:16px/1.5 system-ui;margin:32px} li {margin:12px 0}</style>
      <h1>Peripheral examples</h1><p>Manual tests using the production kernel through three sandboxed frames.</p>
      <ul>${[...examples.keys()].map((name) => `<li><a href="/${name}">${name}</a></li>`).join("")}</ul>`);
    return;
  }
  const name = url.pathname.slice(1);
  const example = examples.get(name);
  if (!example) { response.statusCode = 404; response.end("Unknown example."); return; }
  const depth = url.searchParams.get("depth") === "2" ? 2 : 3;
  let html = example.replace("http://localhost:5173/init.js", `${base}/init.js`);
  for (let i = 1; i < depth; i++) {
    const toolbar = i === depth - 1 ? `<header><a href="${base}/">Examples</a>
      <button onclick="window.showPeripheralPermissions()">Permissions</button></header>` : "";
    html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="color-scheme" content="light dark"><title>${name} example</title>
      <style>html,body {height:100%;margin:0;overflow:hidden} body {display:flex;flex-direction:column;font:16px/1.5 system-ui}
      header {padding:8px;border-bottom:1px solid GrayText} button {font:inherit;margin-left:12px}
      main {flex:1;min-height:0} sw-transclude {height:100%}</style><script src="${base}/init.js"></script></head>
      <body>${toolbar}<main><sw-transclude id="${name}-${i}" name="${name} ${i}" srcdoc="${escape(html)}"></sw-transclude></main></body></html>`;
  }
  response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(Number(process.env.PROBE_PORT ?? 52181), "127.0.0.1", resolve);
});
base = `http://127.0.0.1:${server.address().port}`;
console.log(`Manual peripheral examples: ${base}/`);
console.log("No browser is launched. Restart after source edits. Ctrl+C stops the server.");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
