import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Reuse an existing Playwright install without adding a production dependency.
const manual = process.argv.includes("--manual");
const frameSource = await readFile(new URL("../../../src/transclude/frame.ts", import.meta.url), "utf8");
const quoted = (s) => [...s.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]);
const sandbox = quoted(frameSource.match(/iframe\.sandbox\.add\(([\s\S]*?)\);/)[1]);
const currentAllow = quoted(frameSource.match(/iframe\.allow = \[([\s\S]*?)\]/)[1]);
const withoutPeripherals = currentAllow.filter((s) => !/^(camera|microphone|geolocation) /.test(s)).join("; ");
const allow = [withoutPeripherals, "camera *", "microphone *", "geolocation *"].filter(Boolean).join("; ");
const bundle = await build({
  entryPoints: [new URL("probe.js", import.meta.url).pathname],
  bundle: true, write: false, format: "esm", platform: "browser",
});
let base;
const manualScript = manual ? await readFile(new URL("manual.js", import.meta.url), "utf8") : "";
const mediaScript = manual ? await readFile(new URL("media-manual.js", import.meta.url), "utf8") : "";
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/probe.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
  } else if (manual && req.url === "/manual.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(manualScript);
  } else if (manual && req.url === "/media-manual.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(mediaScript);
  } else {
    res.setHeader("Content-Type", "text/html");
    const script = manual ? (req.url === "/media" ? "/media-manual.js" : "/manual.js") : "/probe.js";
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><body><script>window.probeConfig=${JSON.stringify({ base, sandbox, allow, withoutPeripherals, manual })}</script><script type="module" src="${script}"></script>`);
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(manual ? Number(process.env.PROBE_PORT ?? 5174) : 0, "127.0.0.1", done);
});
base = `http://127.0.0.1:${server.address().port}`;
if (manual) {
  console.log(`Open ${base} in Safari or Chromium, then click Run tests. Ctrl+C stops the server.`);
  await new Promise((done) => {
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(done));
  });
  process.exit(0);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
let browser;
const results = { generatedAt: new Date().toISOString(), cases: [] };
try {
  browser = await chromium.launch({ headless: true, args: [
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  ] });
  results.browser = browser.version();
  results.penpal = JSON.parse(await readFile(new URL("../../../../node_modules/penpal/package.json", import.meta.url), "utf8")).version;
  const context = await browser.newContext({ geolocation: { latitude: 12, longitude: 34 } });
  await context.grantPermissions(["camera", "microphone", "geolocation", "notifications"], { origin: base });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.probe);
  results.host = await page.evaluate(() => window.probe.inspect());
  console.log(JSON.stringify({ host: results.host }));
  assert.equal(results.host.native.media.ok, true, "Synthetic host capture must work");
  for (const mode of ["blob", "srcdoc", "data"]) {
    for (const withAllow of [true, false]) {
      const index = await page.evaluate(([mode, allow]) => window.probe.mount(mode, allow), [mode, withAllow]);
      const inspection = await page.evaluate((i) => window.probe.childCall(i, "inspect"), index);
      const transport = await page.evaluate((i) => window.probe.childCall(i, "transport"), index);
      const frame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
      await frame.locator("#activate").click();
      await frame.waitForFunction(() => window.activationResult);
      const activation = await frame.evaluate(() => window.activationResult);
      const media = await page.evaluate(() => window.probe.media());
      const item = { mode, withAllow, inspection, transport, activation, media };
      results.cases.push(item);
      console.log(JSON.stringify(item));
      await page.evaluate(() => window.probe.dispose());
    }
  }
  // Match the kernel's root blob -> nested srcdoc -> nested data arrangement.
  const root = await page.evaluate(() => window.probe.mount("blob", false));
  const nested = await page.evaluate((i) => window.probe.childCall(i, "mount", ["srcdoc", false]), root);
  const leaf = await page.evaluate(([i, j]) => window.probe.childCall(i, "childCall", [j, "mount", ["data", false]]), [root, nested]);
  results.nested = [];
  for (const frame of page.frames().filter((f) => f !== page.mainFrame())) {
    const inspection = await frame.evaluate(() => window.probe.inspect());
    const transport = await frame.evaluate(() => window.probe.transport());
    results.nested.push({ url: frame.url().slice(0, 40), inspection, transport });
  }
  const deepest = page.frames().at(-1);
  await deepest.locator("#activate").click();
  await deepest.waitForFunction(() => window.activationResult);
  results.nestedActivation = await deepest.evaluate(() => window.activationResult);
  // Root-to-leaf direct native media connection, with Penpal signaling relayed
  // through the intermediate fixture endpoints.
  results.nestedMedia = await page.evaluate((path) => window.probe.media(path), [root, nested, leaf]);
  results.lifetime = await page.evaluate(() => window.probe.lifetime());
  results.diagnostics = diagnostics;
  await page.evaluate(() => window.probe.dispose());
  await writeFile(new URL("results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
  assert.equal(results.host.native.media.ok, true);
  assert.equal(results.host.native.location.ok, true);
  for (const item of results.cases) {
    assert.equal(item.inspection.origin, "null");
    assert.equal(item.inspection.native.media.ok, false);
    assert.equal(item.inspection.native.location.ok, item.withAllow && item.mode !== "data");
    for (const feature of ["file", "buffer", "readable", "writable"]) assert.equal(item.transport[feature].ok, true, feature);
    assert.equal(item.transport.file.value.text, "peripheral probe");
    assert.equal(item.transport.file.value.native, true);
    assert.deepEqual(item.transport.buffer.value.bytes, [1, 2, 3]);
    assert.equal(item.transport.buffer.value.senderDetached, true);
    assert.equal(item.transport.readable.value.cancelled, "probe cancellation");
    assert.deepEqual(item.transport.writable.value.chunks, [7, 8, 9]);
    for (const feature of ["callback", "handle", "eventTarget", "domException"]) assert.equal(item.transport[feature].ok, false, feature);
    for (const shim of Object.values(item.inspection.shims)) assert.equal(shim.value, true);
    assert.equal(item.activation.ancestor.active, true);
    assert.equal(item.media.received.native, true);
    assert.ok(item.media.received.video.width > 0);
    assert.ok(item.media.received.recordedBytes > 0);
    assert.equal(item.media.hostStop.noMoreBytes, true);
  }
  assert.ok(results.nestedMedia.received.recordedBytes > 0);
  assert.equal(results.nestedMedia.hostStop.noMoreBytes, true);
  assert.equal(results.lifetime.pending.code, "CONNECTION_DESTROYED");
  assert.equal(results.lifetime.streamSurvivesRpcDestroy, true);
  console.log(`PASS: ${results.cases.length} root configurations; ${results.nested.length} nested frames. Results saved.`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
