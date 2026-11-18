# Manual local audio and video checks

From the repository root:

```sh
node kernel/test/browser/audio/run.mjs
```

Open <http://localhost:52182/> in Safari, Firefox, or Chromium. The runner builds
the kernel and serves the fixture without opening a browser or running tests.
Restart it after source edits. `AUDIO_TEST_PORT` changes the listening port.

The fixture uses the actual peripheral adapters and permission manager through
three opaque sandboxed frames. `?depth=2` uses two frames. Graffiti Local supplies
the unrelated data service; no login or external JavaScript/CDN is needed.

For an iPhone, use an HTTPS tunnel to port 52182. Plain HTTP on a LAN IP is not a
secure context and cannot request the camera or microphone. For example, with
cloudflared installed, in a second terminal (leave both commands running):

```sh
cloudflared tunnel --url http://127.0.0.1:52182
```

Open the printed HTTPS URL on the phone. The tunnel serves only this fixture and
its bundled kernel; captured media and recordings remain inside the browser.
After the page has loaded, the media bridge itself does not use the tunnel.

## Check in each browser

1. Start, grant permission, speak/move, record, finish, and play back.
   Confirm video motion and intelligible audio, with no WebRTC diagnostic.
2. Stop camera only and check that audio continues; restart and stop microphone
   only while video continues. Finish any recording, then clone and stop the
   original; verify the clone still works. Stop all and check device indicators.
3. Start again, then revoke microphone permission using the toolbar. The native
   device and received track should stop. Repeat using Remove app / Restore app.
4. Try denying permission, then allowing it on a later request. Also remove the
   app while a device prompt is pending; a late grant should not leave capture on.
5. Try rotation, front/back cameras, size/FPS changes, a longer recording, and
   background/foreground. For audio, compare default/mono/stereo preferences.
   Compare the received preview's frame rate/dimensions with the requested values;
   getSettings() describes host capture. Listen for dropouts or growing delay.
   Canvas video does not preserve original capture timestamps, so check clap/lip
   sync in the recording. Audio delivery is 48 kHz with a fixed channel count per
   capture session, even if device settings change.
6. On iPhone, compare Wi-Fi and cellular using the same HTTPS URL.

Copy diagnostics after each failure or useful result, together with the browser
version, device, network, and what you heard. Logs include native capture, context
states, worklet loading, tracks, recording size, frame rate/dimensions, and teardown.
They also include context clocks, the app meter's level, and the original microphone
track's enabled/muted/readyState values. A source-muted track is shown explicitly
in the app; silence alone is not treated as a failed bridge. Logs exclude media
content and device IDs.

To check whether the extra diagnostic nodes affect first-start behavior, compare
`?probes=0` (the default) with `?probes=1` on the same origin. Both modes keep clock
logging and the app's meter. Only `?probes=1` attaches two extra analysers, at the
native microphone input and bridge receiver output. These nodes may affect browser
audio scheduling. For each mode, reload, start and speak, then stop and start again.
Record and play back even if the meter stays flat. Copy diagnostics before switching
modes, then repeat in reverse order to distinguish probe effects from warmed-up
browser permissions or audio state.

Camera-only, microphone-only, and combined requests all use local transport.
The unit tests mock the frame/worklet endpoints to retain permission and lifecycle
coverage; they cannot establish that any browser's media pipeline works.
