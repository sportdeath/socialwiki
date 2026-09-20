import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  browser: { type: "string", default: "chromium" },
  executable: { type: "string" },
  "upstream-rtc-policy": { type: "boolean", default: false },
} });
const executables = {
  chromium: "/Applications/Chromium.app/Contents/MacOS/Chromium",
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  firefox: "/Applications/Firefox.app/Contents/MacOS/firefox",
};
if (!(values.browser in executables)) throw new Error("Use --browser chromium, chrome, or firefox");
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE
  ? pathToFileURL(resolve(process.env.PUPPETEER_MODULE)).href : "puppeteer-core");
const server = spawn(process.execPath, [fileURLToPath(new URL("run.mjs", import.meta.url)), "--manual"], {
  cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
  env: { ...process.env, PROBE_PORT: "0" }, stdio: ["ignore", "pipe", "inherit"],
});
let browser;
let failed = false;
try {
  const base = await new Promise((resolve, reject) => {
    let output = "";
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Test server exited: ${code}`)));
    server.stdout.on("data", (data) => {
      output += data;
      const match = output.match(/Open (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
  });
  const firefox = values.browser === "firefox";
  browser = await puppeteer.launch({
    browser: firefox ? "firefox" : "chrome",
    executablePath: values.executable ?? executables[values.browser], headless: true,
    ...(firefox ? {
      args: ["-no-remote"], extraPrefsFirefox: {
        "media.navigator.streams.fake": true,
        "media.navigator.permission.disabled": true,
      },
    } : {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        ...(values["upstream-rtc-policy"] ? ["--webrtc-ip-handling-policy=default"] : [])],
    }),
  });
  const version = await browser.version();
  console.log(version);
  const directory = new URL("media-results/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const kind of ["synthetic", "camera"]) {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}/media`);
      await page.click(`#${kind}`);
      await page.waitForFunction(() => window.mediaFinished, { timeout: 240000 });
      const report = await page.evaluate(() => window.mediaReport);
      report.automation = {
        browser: version, headless: true,
        source: kind === "camera" ? "fake camera/microphone" : "canvas and oscillator",
        rtcPolicy: values["upstream-rtc-policy"] ? "explicit upstream default" : "browser default",
      };
      const filename = `${values.browser}${values["upstream-rtc-policy"] ? "-upstream" : ""}-${kind}.json`;
      await writeFile(new URL(filename, directory), JSON.stringify(report, null, 2) + "\n");
      for (const row of report.cases) {
        const r = row.result;
        const ok = r?.ok && r.hostStop?.noMoreBytes &&
          ["playback", "frame", "recording", "webAudio", "onward"].every((key) => r.consumers?.[key]?.ok);
        failed ||= !ok;
        console.log(`${kind} ${row.mode}: ${ok ? "PASS" : "FAIL"}`);
      }
      if (report.error || report.cases.length !== 5) failed = true;
      console.log(`Saved ${fileURLToPath(new URL(filename, directory))}`);
    } finally { await page.close(); }
  }
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
}
if (failed) process.exitCode = 1;
