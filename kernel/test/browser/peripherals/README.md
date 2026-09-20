# Peripheral bridge feasibility probes

These are browser experiments, not a production permission guard. The fixture
exposes deliberately unguarded test methods on a loopback-only server. It uses
the installed Penpal 8.0.1 directly, rather than implementing another RPC layer.

**For the subsequent Firefox, Safari, Chrome, and Chromium media experiments,
see [Media portability](MEDIA.md).** That report includes a focused `/media`
page, diagnostic results, and a repeatable browser runner. The observations below
describe the original Chromium-only experiment, not the full current matrix.

## Manual Safari or Chromium run

From the Social.Wiki directory:

```sh
node kernel/test/browser/peripherals/run.mjs --manual
```

Open `http://127.0.0.1:5174` in the actual browser, click **Run tests**, and allow
camera, microphone, and location. Keep the tab foregrounded until it finishes,
then click **Download results**. Repeat in the other browser, using the same
server. Stop the server with Ctrl+C. No Playwright installation is needed.

This mode uses real devices and browser prompts, not mocks. Media stays locally
between frames; exported results contain neither location coordinates nor media
recordings. It does not display notifications or open device/file choosers.
Manual results record observations, including expected rejections, rather than
asserting Chromium-specific behavior. The automated trusted-click activation
test is omitted in manual mode.

## Automated Chromium run

Run from the Social.Wiki directory with Playwright installed, or reuse the
sibling Graffiti checkout's existing development dependency:

```sh
PLAYWRIGHT_MODULE=../graffiti/node_modules/playwright/index.mjs \
  node kernel/test/browser/peripherals/run.mjs
```

Without `PLAYWRIGHT_MODULE`, the runner imports `playwright` normally. Chromium
must already be installed for that Playwright version. The runner uses a fresh
headless browser profile, fake audio/video devices, mocked geolocation, and
mocked browser permissions. It never opens a host file picker, accesses real
camera/microphone/location data, or shows a notification. It creates no external
network peer connection: both WebRTC endpoints are in the test browser and
`iceServers` is empty. The temporary server and browser close after the run.

The runner reads sandbox tokens and remaining `allow` declarations from
`src/transclude/frame.ts`, testing both with and without the former camera,
microphone, and geolocation declarations. It bundles the fixture in memory.
Raw observations are written to the local, ignored `results.json`.

## Observed on 2026-09-20

Chromium 151.0.7922.34, Playwright 1.62.1, Penpal 8.0.1, macOS arm64.
Six configurations: blob/srcdoc/data, each with and without the three former
permissions declarations. Also tested a blob → srcdoc → data nesting chain.

| Probe | Observation |
| --- | --- |
| Penpal connection | Works across all tested opaque frame boundaries. |
| Native `File` | Clones with its class, filename, contents, and methods intact. |
| `ArrayBuffer` | Transfers, preserving bytes and detaching the sender's buffer. |
| `ReadableStream` | Transfers as a native stream; reads and cancellation reach its source. |
| `WritableStream` | Transfers as a native stream; writes and closing reach its sink. |
| Callback function argument | Rejected with Penpal `TRANSMISSION_FAILED`; callbacks need local registration and reverse RPC calls. |
| Thrown `DOMException` | Name/message preserved, but received as an ordinary `Error`; adapters should reconstruct it when necessary. |
| Native `FileSystemHandle` | Host OPFS handle cannot deserialize in the opaque child; the Penpal call times out. Nested opaque parents cannot obtain an OPFS handle themselves. |
| `EventTarget` | Not cloneable. Events need explicit forwarding. No native notification object was tested. |
| `MediaStream` / transferable capture track | Direct cloning/transfer fails in this Chromium build. |
| Standard API installation | Own properties can shadow `navigator.geolocation`, `mediaDevices`, `serial`, `usb`, `window.showOpenFilePicker`, and `Notification`, even where APIs were initially absent. |
| Direct sandbox capture | Fails with `SecurityError` in blob/srcdoc; `mediaDevices` is absent in data frames. Adding camera/microphone declarations does not fix it. |
| Direct sandbox location | With a mocked grant, blob/srcdoc succeeds with `geolocation *`; removing it blocks access. Data frames are insecure and reject access either way. |
| File picker and OPFS in sandbox | Blocked in blob/srcdoc; entry points absent in data frames. |
| Serial/USB enumeration | Blocked by policy in blob/srcdoc; absent in data frames. No physical-device operations tested. |
| User activation | A Playwright click in the child activates all ancestors; activation is still present when observed through Penpal RPC. This does not prove survival after a delayed prompt. |

The location result means the old `geolocation *` declaration was not universally
ineffective. Removing it is also important to keep native child access from
bypassing a future broker. This result is specific to Chromium with a mocked
grant, not evidence that users can grant opaque documents permission normally.

## Media experiment

A host `getUserMedia()` stream is sent over one local WebRTC connection to the
child. Offer/answer signaling uses Penpal. For the deepest frame, signaling is
forwarded through the intermediate frames, but media travels directly between
the host and the leaf.

All seven media cases (six root configurations plus the nested leaf) receive
native audio/video tracks. The fixture verifies decoded video frames, nonempty
`MediaRecorder` output, Web Audio source creation, and acceptance of both tracks
by another `RTCPeerConnection.addTrack()` call. The latter is API acceptance,
not a complete onward call. Video is 640×480 using the synthetic camera.

Stopping host capture and closing its peer connection stops incoming bytes
during the observation interval. This is a basic host-control check, not a full
permission revocation implementation. Remote tracks have remote-media semantics;
capture constraints, device IDs, cloning, and lifetime still need an adapter.
The recorded elapsed time includes setup and a 300 ms recording: it is not an
end-to-end latency or performance benchmark.

Destroying a Penpal connection rejects pending RPC calls, but an already
transferred readable stream remains usable until separately cancelled. Future
broker cleanup must explicitly release resources; destroying RPC is insufficient.

## Consequences for the implementation

- Use Penpal for connections, method calls, replies, errors, and transfer lists.
  Use native transferable streams for byte transport where supported; do not
  build another general-purpose RPC or streaming protocol.
- Keep native file/device handles at the host and use scoped references in
  adapters. Use reverse RPC methods for callbacks and events.
- Use the shared `bridges/source.ts` helpers for names, IDs, and inheritance.
  The intentional authority of ancestors remains unchanged.
- Treat WebRTC as the media adapter's transport candidate. It works in this
  initial Chromium experiment, including the current nested frame forms.
- Resource disposal and permission enforcement remain host responsibilities.

## Limits

In the original experiment below, only Chromium was exercised; Firefox, Safari/WebKit,
mobile browsers, browser-native permission dialogs, file/directory selection,
hardware USB/serial communication, notification display/push, and worker API
compatibility remain untested. In this headless configuration,
`Notification.permission` remains `denied` even with the automation grant, so no
notification-delivery conclusion is possible. This Chromium installation also
rejects synthetic host capture without the fake-media-UI flag, which is why the
fixture uses both fake-media flags.

The experiment does not implement saved grants or a complete standard API
facade. Normal kernel tests remain separate from this opt-in browser probe.
