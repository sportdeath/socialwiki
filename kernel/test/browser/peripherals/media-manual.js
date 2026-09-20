import "/probe.js";

document.title = "Media portability — probe 2";
document.body.innerHTML = `
<style>
body { font:16px system-ui;max-width:950px;margin:30px auto;padding:0 16px }
button { padding:10px;margin-right:12px } pre { white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px }
iframe { position:fixed;bottom:12px;right:12px;width:380px;height:280px;background:white;z-index:2 }
</style>
<h1>Media portability — probe 2</h1>
<p>Start with synthetic media (no device access). Then run camera/microphone
tests and allow the browser prompt. Keep this tab visible. Audio is not played
through your speakers; media stays within this browser. No location request.</p>
<button id="synthetic">Run synthetic media</button>
<button id="camera">Run camera/microphone</button>
<a id="download" hidden>Download results</a>
<p id="status">Ready.</p><pre id="results"></pre>`;
const status = document.querySelector("#status");
const output = document.querySelector("#results");
const download = document.querySelector("#download");
let downloadUrl;
const browserName = /Firefox/.test(navigator.userAgent) ? "firefox"
  : /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? "safari" : "chromium";

window.runMediaSuite = async (kind) => {
  for (const b of document.querySelectorAll("button")) b.disabled = true;
  download.hidden = true;
  const report = { probeVersion: 2, generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent, source: kind, cases: [] };
  const update = (message) => {
    status.textContent = message;
    output.textContent = JSON.stringify(report, null, 2);
  };
  window.mediaReport = report;
  window.mediaFinished = false;
  try {
    update("Preparing media source…");
    report.hostSource = await window.probe.mediaPrepare(kind);
    for (const mode of ["same-origin", "blob", "srcdoc", "data", "nested"]) {
      update(`Testing ${mode} with direct capture delegation disabled…`);
      const row = { mode };
      report.cases.push(row);
      try {
        const root = await window.probe.mount(mode === "nested" ? "blob" : mode, false);
        const path = [root];
        if (mode === "nested") {
          path.push(await window.probe.leafCall(path, "mount", ["srcdoc", false]));
          path.push(await window.probe.leafCall(path, "mount", ["data", false]));
        }
        row.result = await window.probe.mediaPortability(path);
      } catch (e) { row.error = { name: e.name, message: e.message }; }
      finally { await window.probe.dispose(); }
      update(`Finished ${mode}.`);
    }
    update("Testing actual native track transfer and receiver cloning…");
    try {
      const root = await window.probe.mount("srcdoc", false);
      report.directTrack = await window.probe.mediaDirect([root]);
    } catch (e) { report.directTrack = { error: { name: e.name, message: e.message } }; }
  } catch (e) { report.error = { name: e.name, message: e.message }; }
  finally {
    await window.probe.dispose();
    await window.probe.mediaStopSource();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    download.href = downloadUrl;
    download.download = `media-v2-${browserName}-${kind}.json`;
    download.hidden = false;
    for (const b of document.querySelectorAll("button")) b.disabled = false;
    const passed = report.cases.filter((c) => c.result?.ok).length;
    update(`Finished: ${passed}/${report.cases.length} WebRTC cases passed. Download this report before running the other source.`);
    window.mediaFinished = true;
  }
  return report;
};
document.querySelector("#synthetic").onclick = () => window.runMediaSuite("synthetic");
document.querySelector("#camera").onclick = () => window.runMediaSuite("camera");
