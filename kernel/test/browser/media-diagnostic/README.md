# Firefox media connection diagnosis

Manual test of the **current production kernel**, with test-only instrumentation
loaded before it in each realm. The server never launches a browser. Production
bridge code and browser settings are unchanged.

Reported behavior: Firefox returns `NotReadableError: The local media connection
ended` for camera, microphone, and both; Chrome and Safari work. That message is
emitted when one peer's `connectionState` becomes `failed` or `closed`. It does not
identify ICE versus DTLS or the first failing endpoint. A shared connection/setup
failure is the leading hypothesis, not a camera-specific capture failure.

The earlier portability fixture used `addTrack()` and a different signaling
path. This fixture compares that negotiation difference and candidate timing
while retaining the real kernel, sandbox, permission guard and Penpal relays.

## Run

From the Social.Wiki repository:

```sh
node kernel/test/browser/media-diagnostic/run.mjs
```

Open <http://127.0.0.1:52179/> in the **same Firefox profile** where the app failed.
The server bundles the current sources at startup; restart after source changes.
Use `PROBE_PORT=52180` to choose another port. Ctrl+C stops the server.

1. On **baseline**, click **Camera** and allow the site/browser prompts. Wait for
   Connected or an error (or the 45-second pending message), then **Download report**.
2. Select **add-track** in the bottom panel. Repeat Camera and download.
3. Select **gather-first**. Repeat Camera and download.
4. Send the three JSON reports. No need to repeat every device: the existing
   camera/microphone/both failures already establish this is not camera-only.

Keep the tab visible. If baseline unexpectedly succeeds, report that too; this
isolated app lacks the browser lens and instrumentation can change timing.
The default three iframe levels exercise blob → srcdoc → data and actual ancestor
relays. If all three variants fail, an optional fourth run at
<http://127.0.0.1:52179/?depth=1> tests only the root blob frame. Download filenames
include both variant and depth.

The app calls getUserMedia directly, without awaiting an AudioContext resume.
This matters for investigating Chromium's separate “Waiting for access” symptom:
that text alone cannot establish a WebRTC policy failure. The report distinguishes
no app request, waiting on the site guard, waiting on native capture, and a peer
connection that has started but failed.

## Variants and evidence

- **baseline**: unchanged `sendonly` transceivers and trickle ICE.
- **add-track**: replaces track-based `addTransceiver` with native `addTrack`, as in
  the earlier portability probe. Everything else remains baseline.
- **gather-first**: keeps sendonly but waits for full local ICE gathering before
  forwarding offer/answer, with candidates embedded in SDP and trickle suppressed.
  Gathering has a 20-second bound; normal bridge deadlines still apply.

`native-capture-resolved` separates capture permission/hardware from transport.
Both `setRemoteDescription-done` events establish whether negotiation progressed.
Local and applied candidate summaries establish whether candidates were gathered
and exchanged. ICE/connection transitions and allowlisted candidate-pair/transport
stats distinguish ICE connectivity from DTLS failure. Track/unmute events and RTP
counters show whether media arrived before cleanup. `close-request` records state
before the adapter tears the peer down, so cleanup is distinguishable from the
initial failure.

Only a passing variant compared with a failing baseline is evidence for that
specific change; none is installed as a production fix yet. If all fail, compare
candidate types/address classes and pair request/response counters before trying
any browser preference changes. Mozilla's
[about:webrtc documentation](https://firefox-source-docs.mozilla.org/contributing/debugging/debugging_webrtc_calls.html)
describes deeper ICE and RTP diagnostics if this report is insufficient.

Reports contain browser version, timestamps, peer states, codec/direction summaries,
candidate types/address classes and numeric counters. They omit recordings,
raw SDP/candidates, IP/mDNS addresses, device IDs/labels, ICE passwords, fingerprints,
and native error text (which can embed sensitive SDP). All media stays local;
no STUN/TURN servers are configured. Event collection is test-only and kept in memory
until you explicitly download a report.

Unit tests cover the diagnostic hooks, variant behavior, bounded gathering, and
redaction. These tests do not replace the manual Firefox run.
