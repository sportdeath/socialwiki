import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// Manual only: build the actual kernel and serve a fixture. Never launch a browser.
execFileSync("npm", ["run", "build:js", "--workspace", "@socialwiki/kernel"], {
  cwd: new URL("../../../../", import.meta.url), stdio: "inherit",
});
const [bundle, fixture, diagnostics] = await Promise.all([
  readFile(new URL("../../../dist/init-test.js", import.meta.url), "utf8"),
  readFile(new URL("app.html", import.meta.url), "utf8"),
  readFile(new URL("diagnostics.js", import.meta.url), "utf8"),
]);
const version = createHash("sha256").update(bundle).update(diagnostics).update(fixture).digest("hex").slice(0, 12);
const assets = new Map([
  ["/init.js", bundle], ["/diagnostics.js", diagnostics],
].map(([path, text]) => [path, { plain: Buffer.from(text), gzip: gzipSync(text) }]));
const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  const url = new URL(request.url, `http://${host}`);
  // The tunnel can report its internal HTTP leg in proxy headers. Public test
  // URLs use HTTPS; only loopback is served directly over HTTP.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.protocol = "https:";
  const asset = assets.get(url.pathname);
  if (asset) {
    response.setHeader("Content-Type", "text/javascript");
    response.setHeader("Vary", "Accept-Encoding");
    if (url.searchParams.get("v") === version) {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    const compressed = /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
    const body = compressed ? asset.gzip : asset.plain;
    if (compressed) response.setHeader("Content-Encoding", "gzip");
    response.setHeader("Content-Length", body.length);
    console.log(`${request.method} ${url.pathname}: ${body.length} bytes${compressed ? " gzip" : ""}`);
    response.end(body);
    return;
  }
  if (url.pathname !== "/") { response.writeHead(404).end("Not found"); return; }
  const depth = url.searchParams.get("depth") === "2" ? 2 : 3;
  const probes = url.searchParams.get("probes") === "1";
  // Sandboxed frames cannot read the top URL, so pass the probe setting explicitly.
  const scripts = `<script src="${url.origin}/diagnostics.js?v=${version}" data-audio-probes="${probes}"></script><script src="${url.origin}/init.js?v=${version}"></script>`;
  let html = fixture.replace("<!-- KERNEL -->", scripts);
  for (let i = 1; i < depth; i++) {
    const contents = `<sw-transclude id="media-${i}" name="Media test ${i}" srcdoc="${escape(html)}"></sw-transclude>`;
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Local media bridge — manual test</title><meta name="color-scheme" content="light dark">
      <style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font:15px/1.5 system-ui}
      header{padding:8px;border-bottom:1px solid GrayText}main{flex:1;min-height:0}sw-transclude{height:100%}button{font:inherit;margin:4px}</style>
      ${scripts}</head><body>${i === depth - 1 ? `<header>
      <span>${depth} sandboxed frames · Extra audio probes: ${probes ? "ON" : "OFF"}</span>
      <button onclick="window.showPermissions()">Permissions / revoke</button>
      <button onclick="document.querySelector('main').replaceChildren()">Remove app</button>
      <button onclick="document.querySelector('main').replaceChildren(document.querySelector('template').content.cloneNode(true))">Restore app</button>
      </header><template>${contents}</template>` : ""}<main>${contents}</main></body></html>`;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(Number(process.env.AUDIO_TEST_PORT ?? 52182), "127.0.0.1", resolve);
});
console.log(`Manual media test: http://localhost:${server.address().port}/`);
console.log(`Kernel: ${assets.get("/init.js").plain.length} bytes minified, ${assets.get("/init.js").gzip.length} bytes gzip; version ${version}.`);
console.log("No browser opened and no tests run. Restart this server after source edits.");
console.log("For a phone, use an HTTPS tunnel to this port; plain LAN HTTP cannot access camera/microphone.");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
