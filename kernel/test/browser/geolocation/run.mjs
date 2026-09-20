import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

// Run the built, complete kernel with a mocked host provider, never real location.
const { values } = parseArgs({ options: { browser: { type: "string", default: "chrome" } } });
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE
  ? pathToFileURL(resolve(process.env.PUPPETEER_MODULE)).href : "puppeteer-core");
const kernel = await readFile(new URL("../../../dist/init.js", import.meta.url));
const demo = await readFile(new URL("../../../../examples/geolocation.html", import.meta.url), "utf8");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
let base;
const server = createServer((req, res) => {
  if (req.url === "/init.js") { res.setHeader("Content-Type", "text/javascript"); res.end(kernel); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const app = demo.replace("http://localhost:5173/init.js", `${base}/init.js`);
  const wrap = (body) => `<!doctype html><meta charset="UTF-8"><title>Bridge test</title><script src="${base}/init.js"></script><body>${body}</body>`;
  const transclude = (id, name, html, inherit = false) => `<sw-transclude id="${id}" name="${name}" ${inherit ? 'permission-scope="inherit"' : ""} srcdoc="${escape(html)}"></sw-transclude>`;
  res.end(req.url === "/nested" ? wrap(transclude("outer", "Outer", wrap(transclude("inner", "Map", app)))) : app);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const firefox = values.browser === "firefox";
  browser = await puppeteer.launch({ browser: firefox ? "firefox" : "chrome", headless: true,
    executablePath: firefox ? "/Applications/Firefox.app/Contents/MacOS/firefox" : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...(firefox ? { args: ["-no-remote"] } : {}),
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("Page error:", error.message));
  await page.evaluateOnNewDocument(() => {
    if (window !== window.top) return;
    let next = 1;
    const watches = new Map();
    window.geoTest = {
      starts: [], clears: [], watches,
      fix() { for (const { success } of watches.values()) success({ timestamp: 1234, coords: {
        latitude: 42, longitude: -71, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      } }); },
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition(success, error, options) {
        const id = next++; watches.set(id, { success, error });
        window.geoTest.starts.push({ id, options }); return id;
      },
      clearWatch(id) { watches.delete(id); window.geoTest.clears.push(id); },
    } });
  });
  const dialog = () => page.evaluate(() => [...document.querySelectorAll("div")]
    .map((e) => e.shadowRoot?.querySelector("dialog")).find((d) => d?.open)?.textContent);
  const waitDialog = () => page.waitForFunction(() => [...document.querySelectorAll("div")]
    .some((e) => e.shadowRoot?.querySelector("dialog")?.open), { timeout: 10000 }).catch(async (error) => {
      for (const frame of page.frames()) console.error("Frame:", frame.url().slice(0, 55), await frame.evaluate(() => ({
        status: document.querySelector("#status")?.textContent,
        locationAPI: Object.hasOwn(navigator, "geolocation"),
      })).catch(() => "Detached"));
      throw error;
    });
  async function button(text, remember = false) {
    await page.evaluate((text, remember) => {
      const root = [...document.querySelectorAll("div")].map((e) => e.shadowRoot).find((r) => r?.querySelector("dialog"));
      if (remember) root.querySelector('input[type="checkbox"]').checked = true;
      const button = [...root.querySelectorAll("button")].find((b) => b.textContent === text);
      if (!button) throw new Error(`Missing host button ${text}`);
      button.click();
    }, text, remember);
  }
  async function leaf(path = "/") {
    await page.goto(base + path);
    await page.waitForFunction(() => document.querySelector("sw-transclude"));
    let frame;
    const deadline = Date.now() + 15000;
    while (!frame && Date.now() < deadline) {
      for (const f of page.frames().slice(1)) {
        if (await f.$("#locate").catch(() => null)) { frame = f; break; }
      }
      if (!frame) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(frame, "Demo frame loaded through the real kernel");
    return frame;
  }
  let frame = await leaf();
  await frame.click("#locate"); await waitDialog();
  assert.equal(await page.evaluate(() => window.geoTest.starts.length), 0);
  await button("Deny");
  await frame.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Access denied"));
  assert.equal(await page.evaluate(() => window.geoTest.starts.length), 0);
  console.log("PASS denial does not access native location");

  await frame.click("#locate"); await waitDialog(); await button("Allow", true);
  await page.waitForFunction(() => window.geoTest.watches.size === 1);
  await page.evaluate(() => window.geoTest.fix());
  await frame.waitForFunction(() => document.querySelector("#latitude").textContent === "42.00000°").catch(async (error) => {
    console.error("Demo state:", await frame.evaluate(() => ({ status: document.querySelector("#status").textContent, visibility: document.visibilityState })));
    throw error;
  });
  assert.equal(await frame.$eval("#point", (el) => el.getAttribute("cx")), "129");
  await page.waitForFunction(() => window.geoTest.watches.size === 0);
  console.log("PASS native result crosses sandbox, renders demo, and releases one-shot");

  // Reload retains the grant for the root's intentionally inherited scope.
  frame = await leaf();
  await frame.click("#watch");
  await page.waitForFunction(() => window.geoTest.watches.size === 1);
  assert.equal(await dialog(), undefined);
  await page.evaluate(() => window.geoTest.fix());
  await frame.waitForFunction(() => document.querySelector("#latitude").textContent === "42.00000°");
  await frame.evaluate(() => window.showPeripheralPermissions()); await button("Revoke");
  await page.waitForFunction(() => window.geoTest.watches.size === 0);
  await frame.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Access denied"));
  await button("Close");
  console.log("PASS remembered grant survives reload; host revocation stops watch");

  await frame.click("#watch"); await waitDialog();
  // Cancellation can happen programmatically while the modal blocks document clicks.
  await frame.evaluate(() => document.querySelector("#stop").click());
  await page.waitForFunction(() => ![...document.querySelectorAll("div")].some((e) => e.shadowRoot?.querySelector("dialog")?.open));
  assert.equal(await page.evaluate(() => window.geoTest.watches.size), 0);
  console.log("PASS clearWatch dismisses pending authorization without native access");

  frame = await leaf("/nested");
  await frame.click("#watch"); await waitDialog();
  assert.match(await dialog(), /Outer.*Map/);
  await button("Allow", true);
  await page.waitForFunction(() => window.geoTest.watches.size === 1);
  await page.evaluate(() => window.geoTest.fix());
  await frame.waitForFunction(() => document.querySelector("#latitude").textContent === "42.00000°").catch(async (error) => {
    console.error("Nested demo:", await frame.evaluate(() => ({ status: document.querySelector("#status").textContent, visibility: document.visibilityState })));
    throw error;
  });
  await frame.click("#stop");
  await page.waitForFunction(() => window.geoTest.watches.size === 0);
  console.log("PASS blob → srcdoc → data nesting and watch cancellation");

  await frame.click("#watch");
  await page.waitForFunction(() => window.geoTest.watches.size === 1);
  await frame.parentFrame().evaluate(() => document.querySelector("sw-transclude").remove());
  await page.waitForFunction(() => window.geoTest.watches.size === 0);
  console.log("PASS removing a transclusion releases its native watch");
  console.log(`All geolocation browser checks passed: ${await browser.version()}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
