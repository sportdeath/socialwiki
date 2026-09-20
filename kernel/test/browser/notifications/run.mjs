import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const probe = here("probe.ts");
const theme = await readFile(new URL("../../../../theme.css", import.meta.url), "utf8");
const example = await readFile(new URL("../../../../examples/notifications.html", import.meta.url), "utf8");
const display = await readFile(new URL("display.js", import.meta.url), "utf8");
const settings = { bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "text" } };
// Inject the experiment only in this bundle. Production source and native APIs stay unchanged.
const kernel = (await build({ ...settings, entryPoints: [here("../../../src/init.ts")],
  define: { KERNEL_IMPORT_MAP: JSON.stringify({ imports: {} }) },
  plugins: [{ name: "notification-diagnostic", setup(build) {
    build.onLoad({ filter: /bridges\/peripherals\/adapters\/index\.ts$/ }, async ({ path }) => {
      let contents = await readFile(path, "utf8");
      const host = "return new Map([";
      const child = "export function installPeripheralAdapters(service: PeripheralsService) {";
      if (!contents.includes(host) || !contents.includes(child)) throw new Error("Adapter registry changed; update diagnostic injection.");
      contents = `import { createDiagnosticAdapter, installDiagnostic } from ${JSON.stringify(probe)};\n` + contents
        .replace(host, `${host}\n["notification-diagnostic", createDiagnosticAdapter()],`)
        .replace(child, `${child}\ninstallDiagnostic(service);`);
      return { contents, loader: "ts", resolveDir: here("../../../src/bridges/peripherals/adapters/") };
    });
  } }],
})).outputFiles[0].text;
const native = (await build({ ...settings, entryPoints: [probe] })).outputFiles[0].text;
const production = (await build({ ...settings, entryPoints: [here("../../../src/init.ts")],
  define: { KERNEL_IMPORT_MAP: JSON.stringify({ imports: {} }) },
})).outputFiles[0].text;
const displayKernel = display + "\n" + production;
const productionSha256 = createHash("sha256").update(production).digest("hex");
const kernelSha256 = createHash("sha256").update(kernel).digest("hex");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
let base;
const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");
  const url = new URL(request.url, base);
  if (["/display.js", "/display-kernel.js"].includes(url.pathname)) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(url.pathname === "/display.js" ? display : displayKernel); return;
  }
  if (url.searchParams.has("display")) {
    const native = url.searchParams.get("display") === "native";
    const config = JSON.stringify({ base, native, productionSha256, depth: native ? 0 : 3 });
    const wrap = (body, nested = false) => `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Notification display diagnostic</title>
      <style>${theme} body {font:16px/1.5 system-ui;margin:0;background:var(--background-color);color:var(--text-color)}
      ${nested ? "html,body {height:100%;overflow:hidden} sw-transclude {height:100%}" : "main {padding:20px}"}
      button {font:inherit;padding:8px;margin:4px} label {display:block;margin:8px 0}</style>
      <script>window.notificationDisplayConfig=${config}</script><script src="${base}/${native ? "display.js" : "display-kernel.js"}"></script>
      </head><body>${body}</body></html>`;
    let html = wrap(native ? "" : '<main id="display-app"></main>');
    if (!native) for (let i = 1; i < 3; i++) html = wrap(`<sw-transclude id="display-${i}" name="Display test ${i}" srcdoc="${escape(html)}"></sw-transclude>`, true);
    response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return;
  }
  if (["/init.js", "/native.js", "/production.js"].includes(url.pathname)) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(url.pathname === "/init.js" ? kernel : url.pathname === "/production.js" ? production : native); return;
  }
  if (url.pathname === "/popup") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>Notification destination reached</title><p>The notification destination loaded. You can close this tab, or go back if it replaced the test page.</p>
      <script>window.opener?.postMessage({ notificationDisplayPopup: new URL(location.href).searchParams.get("token") }, "*")</script>`); return;
  }
  const depth = url.searchParams.get("depth") === "1" ? 1 : 3;
  const isNative = url.searchParams.has("native");
  const config = JSON.stringify({ base, depth, native: isNative, kernelSha256 });
  const wrap = (body, nested = false) => `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Notifications diagnostic</title>
    <style>${theme} body {font:16px system-ui;margin:0;background:var(--background-color);color:var(--text-color)}
    ${nested ? "html,body {height:100%;overflow:hidden} sw-transclude {height:100%}" : "main {padding:20px;max-width:850px;margin:auto}"}
    button,select,textarea {font:inherit;padding:7px;margin:4px;max-width:100%;box-sizing:border-box} a {color:var(--link-color)}
    button {color:var(--text-color);background:var(--background-color-interactive);border:1px solid var(--border-color);border-radius:4px}
    output {display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0} label {display:block;margin:8px 0}</style>
    <script>window.notificationDiagnosticConfig=${config}</script><script src="${base}/${isNative ? "native" : "init"}.js"></script></head><body>${body}</body></html>`;
  const isApp = url.searchParams.get("app") === "notifications";
  let html = isApp ? example.replace("http://localhost:5173/init.js", `${base}/production.js`)
    : wrap('<main id="notification-probe"></main>');
  if (!isNative) for (let i = 1; i < depth; i++) html = wrap(`<sw-transclude id="notifications-${i}" name="Notifications ${i}" srcdoc="${escape(html)}"></sw-transclude>`, true);
  if (isApp) html = html.replaceAll(`${base}/init.js`, `${base}/production.js`);
  response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
});
await new Promise((resolve, reject) => {
  server.once("error", reject); server.listen(Number(process.env.PROBE_PORT ?? 52181), "127.0.0.1", resolve);
});
base = `http://127.0.0.1:${server.address().port}`;
console.log(`Open ${base}/ in each desktop browser. Native baseline: ${base}/?native=1`);
console.log(`Production adapter example: ${base}/?app=notifications`);
console.log(`Display failure diagnostic: ${base}/?display=bridge`);
console.log("Manual only; no browser is launched. Restart after source edits. Ctrl+C stops the server.");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
