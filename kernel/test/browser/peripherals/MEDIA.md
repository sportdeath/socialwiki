# Media portability follow-up

WebRTC can deliver native audio/video tracks from the host into the tested
opaque sandbox frames in all three browser engines. Penpal carries signaling;
it does not serialize the media itself. Browser WebRTC policy remains a hard
prerequisite. This is a feasibility fixture, not a production permission guard.

## Results (2026-09-20, macOS)

Each source is tested in five configurations: a trusted same-origin control,
opaque blob, srcdoc, data, and a blob → srcdoc → data nesting chain. The three
peripheral `allow` declarations are absent. The nested case uses one host-to-leaf
media connection; only signaling passes through ancestors.

| Browser | Sources | WebRTC cases |
| --- | --- | --- |
| Firefox 156.0 | Synthetic and fake camera/microphone | 10/10 pass |
| Google Chrome 153.0.8010.48 | Synthetic and fake camera/microphone | 10/10 pass |
| Installed Chromium 150.0.7871.46, default policy | Synthetic and fake camera/microphone | 0/10; no ICE candidates at either endpoint |
| Same Chromium, explicit upstream WebRTC policy | Synthetic and fake camera/microphone | 10/10 pass |
| Safari 26.5, actual browser UI | Synthetic | 5/5 pass |

Synthetic sources are an animated canvas and oscillator. The automated camera
tests use browser fake devices. These follow-up runs did not access real camera
or microphone hardware. The earlier user-supplied Safari report separately
passed real-device media tests in the original fixture.

Passing means muted video playback and advancing video time with nonzero
dimensions, received audio bytes, nonempty MediaRecorder output, acceptance by
Web Audio's MediaStream source node, and acceptance by a further peer
connection's `addTrack`. Closing the host peer stops receiver byte growth in the
measured interval. Web Audio was not checked for audible output; onward calling
was checked for API acceptance, not a complete second negotiated connection.
No latency, quality, background-tab, mobile, or long-running stability claim is
made by these short tests.

### Chromium failure isolated

The installed Chromium produces zero ICE candidates even in the same-origin
control. Switching only its WebRTC IP handling policy to upstream `default` in
a temporary browser profile makes all ten cases pass. This isolates the failure
to that policy rather than sandbox origin or Penpal transport. Google Chrome
passes without that override. The user's normal browser settings were unchanged.

This behavior is consistent with the [ungoogled-chromium WebRTC FAQ](https://github.com/ungoogled-software/ungoogled-chromium-wiki/blob/master/faq.md)
and its [documented policy flag](https://github.com/ungoogled-software/ungoogled-chromium/blob/master/docs/flags.md).
A production bridge must report this failure clearly; a web app cannot silently
override a browser's WebRTC policy.

### Firefox qualification

The user's original report is Firefox 155; the installed binary now launches
156. The revised probe passes in 156, but so does a control run of the original
probe with fake devices. Therefore the old failure is **not proven fixed by
trickle ICE**. Its cause remains unresolved. Native UI automation could select
the probe tab in the older running session but could not obtain matching page
content, so no new result is claimed for that session. Re-run `/media` there to
distinguish source/capture trouble from signaling or playback trouble.

### Native track transfer is not the portable default

Direct track transfer is rejected in the tested Firefox and Chromium engines.
Safari receives actual native MediaStreamTracks: they construct a stream, play,
record, and clone. This validates the earlier ambiguous serialized `{}` result.
After the host stops its originals, the transferred tracks and receiver-created
clones still report `live`; video time also advances. That is not a pixel-level
test of continued capture, but it demonstrates that stopping host originals
cannot be assumed to end receiver-owned tracks. The fixture explicitly cleans
them up afterward.

Prefer WebRTC for a portable, host-controlled delivery lifetime. Closing the
host peer stops new media delivery without trusting the document to cooperate.
It cannot retract media the document already recorded. Receiving tracks still
have remote-track semantics: `getSettings`, `getCapabilities`, `applyConstraints`,
cloning and stopping are not a transparent copy of the host capture object.

## Reproduce manually

From the Social.Wiki repository, start a new server (or restart an existing one
after edits; the fixture is bundled once at startup):

```sh
PROBE_PORT=52178 node kernel/test/browser/peripherals/run.mjs --manual
```

Open <http://127.0.0.1:52178/media>. Click **Run synthetic media**, keep the tab
visible, and **Download results**. Then run **Run camera/microphone**, respond to
the browser prompt, and download that separate result. The first test needs no
device permission. Media stays within the browser, audio is not played through
speakers, and the exported JSON contains no recordings or raw SDP/IP addresses.
There are no public STUN/TURN servers. Stop the server with Ctrl+C.

The report separates source preparation, offer/answer, playback, consumer checks,
and host stopping. It includes both endpoint connection states, candidate
counts/types, event timing, and sanitized RTP statistics on failures.

## Repeatable automation

`run-media.mjs` uses maintained Puppeteer browser drivers, an installed browser,
a temporary browser profile, a temporary loopback server, and fake devices. It
closes its own browser/server afterward. It does not alter production dependencies.
Install `puppeteer-core` in a separate tools directory, then set
`PUPPETEER_MODULE` to its package's `lib/puppeteer/puppeteer-core.js` entry point
(or omit the variable if the package is already resolvable):

```sh
PUPPETEER_MODULE=/tmp/socialwiki-media-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js \
  node kernel/test/browser/peripherals/run-media.mjs --browser firefox
```

Use `--browser chrome` or `--browser chromium` for the other installations.
`--executable /absolute/path/to/browser` overrides the macOS default path.
For the explicit policy comparison only, add `--upstream-rtc-policy` to Chromium.
Puppeteer 25.11.0 was used. Safari was tested through its normal UI without
enabling remote automation.

Raw reports are in ignored `media-results/`: `firefox-*`, `chrome-*`,
`chromium-*`, `chromium-default-*` (the initial policy comparison), and
`safari-synthetic.json`. Future runner policy comparisons use the clearer
`chromium-upstream-*` filename. `firefox-original-probe.json` is the old-fixture
control. Some initial failed reports say `hostStop.noMoreBytes: true` with empty
statistics; that is vacuous, not a revocation success. The current fixture also
requires evidence that media was received before considering this check passed.

## Implementation boundaries

- Keep Penpal connections, requests, errors, and transfer lists. Add explicit
  media signaling methods rather than another general RPC protocol.
- Keep permission decisions and capture ownership at the host. Reuse
  `bridges/source.ts` for document identity and intentional ancestor authority.
- Keep media sessions, native peer connections, ICE handling, constraints
  forwarding, and resource cleanup inside a media bridge. Transclusion only
  provides its existing lifecycle and bridge attachment points.
- Return native receiving streams/tracks to ordinary document consumers. Add
  narrow adapters for capture-control semantics; a generic JavaScript Proxy
  cannot make remote tracks fully identical to capture tracks.
- Treat source closure, navigation, disconnect, and grant revocation as explicit
  host cleanup triggers. Destroying the Penpal connection alone is insufficient.

Before calling the production bridge complete, test real-device Firefox 155
with the new diagnostics, full onward calls, explicit user-activated Web Audio
processing, capture constraints, simultaneous consumers, and revocation under
navigation/backgrounding. These are follow-on compatibility checks, not reasons
to add a custom audio/video serialization transport now.
