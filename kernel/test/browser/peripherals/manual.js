import "/probe.js";

document.title = "Social.Wiki peripheral feasibility";
document.body.innerHTML = `
  <style>
    body { font: 16px system-ui; max-width: 960px; margin: 32px auto; padding: 0 16px; }
    button, a { margin-right: 16px; }
    button { padding: 10px 16px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
    iframe { position: fixed; right: 16px; bottom: 16px; width: 400px;
      height: 300px; z-index: 1; background: white; }
  </style>
  <h1>Peripheral feasibility</h1>
  <p>Keep this tab in the foreground. Click Run tests and allow camera,
  microphone, and location when prompted. Tests use your real devices locally.
  Location coordinates and recordings are not included in the report;
  media stays between frames in this browser.</p>
  <p>No USB/serial device chooser, local-file picker, or notification is opened.</p>
  <button id="run">Run tests</button><a id="download" hidden>Download results</a>
  <p id="status">Ready.</p><pre id="results"></pre>`;

const button = document.querySelector("#run");
const status = document.querySelector("#status");
const output = document.querySelector("#results");
const download = document.querySelector("#download");
let downloadUrl;
const outcome = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (error) { return { ok: false, error: { name: error.name, message: error.message } }; }
};

button.onclick = async () => {
  button.disabled = true;
  download.hidden = true;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  const report = {
    generatedAt: new Date().toISOString(), userAgent: navigator.userAgent,
    mode: "manual; real peripherals; browser-native permissions",
    activation: "Not tested: manual runner does not synthesize trusted iframe clicks",
    cases: [],
  };
  const update = (message) => {
    status.textContent = message;
    output.textContent = JSON.stringify(report, null, 2);
  };
  try {
    update("Checking host APIs. Respond to browser permission prompts.");
    report.host = await window.probe.inspect();
    for (const mode of ["blob", "srcdoc", "data"]) {
      for (const withAllow of [true, false]) {
        const item = { mode, withAllow };
        report.cases.push(item);
        update(`Testing ${mode}, old allow declarations ${withAllow ? "on" : "off"}…`);
        try {
          const index = await window.probe.mount(mode, withAllow);
          item.inspection = await outcome(() => window.probe.childCall(index, "inspect"));
          item.transport = await outcome(() => window.probe.childCall(index, "transport"));
          item.media = report.host.native.media.ok
            ? await outcome(() => window.probe.media([index]))
            : { skipped: "Host camera/microphone capture failed; see host result" };
        } catch (error) {
          item.error = { name: error.name, message: error.message };
        } finally {
          await window.probe.dispose();
        }
        update(`Finished ${mode}, allow declarations ${withAllow ? "on" : "off"}.`);
      }
    }
    update("Testing nested blob → srcdoc → data frames…");
    report.nested = await outcome(async () => {
      const root = await window.probe.mount("blob", false);
      const nested = await window.probe.childCall(root, "mount", ["srcdoc", false]);
      const leaf = await window.probe.leafCall([root, nested], "mount", ["data", false]);
      const path = [root, nested, leaf];
      return {
        inspection: await window.probe.leafCall(path, "inspect", []),
        transport: await window.probe.leafCall(path, "transport", []),
        media: report.host.native.media.ok ? await outcome(() => window.probe.media(path))
          : { skipped: "Host capture failed" },
      };
    });
    await window.probe.dispose();
    report.lifetime = await outcome(() => window.probe.lifetime());
  } catch (error) {
    report.error = { name: error.name, message: error.message };
  } finally {
    await window.probe.dispose();
    update("Finished. Download results from this browser; expected sandbox rejections are recorded too.");
    downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    download.href = downloadUrl;
    download.download = `peripheral-probe-${/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? "safari" : "chromium"}.json`;
    download.hidden = false;
    button.disabled = false;
  }
};
