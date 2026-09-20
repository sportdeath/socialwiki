# Manual peripheral checks

From `socialwiki/`:

```sh
node kernel/test/browser/peripherals/run.mjs
```

Open <http://127.0.0.1:52181/> and select an example. The server bundles the
**production kernel**, without alternate adapters or instrumentation, and never
opens or controls a browser. Restart it after source edits. `PROBE_PORT=52182`
chooses another port. Each example uses three sandboxed frames; `?depth=2`
uses two. The toolbar opens the shared Permissions manager.

The five [examples](../../../../examples/README.md) can also be pasted into
Social.Wiki. Their README describes each test. Use the normal View lens to check
integration with the address bar and navigation; in this runner, query navigation
stays within the example's containing transclusion.

Useful regression checks in each relevant browser:

- Allow, Deny, click-away dismissal, remembered decisions after reload, and
  revocation from Permissions. Only currently open document scopes should appear.
- Geolocation: one fix, repeated updates, Stop, and revocation while watching.
- Media: camera, microphone, both in one prompt, recording/playback, and Stop.
  Revoking either grant must stop a combined capture, including clones.
- Files: create a disposable file, edit it locally, observe fresh reads, and
  append a browser write. Try cancellation and a native permission prompt left
  open longer than 15 seconds. Revocation aborts uncommitted writers; completed
  writes cannot be undone. Reconnect if an editor replaces the selected file.
- Notifications: remembered permission at startup, delayed display, optional
  blob icon, click navigation, explicit close, and leaving the document.
- Compatibility: permission changes, device enumeration, directory iteration,
  cross-picker handle comparison, and native stream piping.

## Findings retained from the retired experiments

The initial portability probes and temporary media/notification diagnostics
have served their purpose and were removed. The production tests remain in
`kernel/test/peripherals*.spec.ts`, `filesystem.spec.ts`, and
`transclude-preparation.spec.ts`.

- Media uses native WebRTC between host and leaf, with Penpal signaling. Direct
  track transfer was not portable across the tested engines and did not provide
  the same host-controlled lifetime. No STUN/TURN server is involved.
- The tested Chromium installation's WebRTC policy blocked even a same-origin
  control. Firefox's reported media failure cleared after changing its
  `media.peerconnection.ice.proxy_only` setting. These were browser policy
  restrictions, not reasons to add another media serialization implementation.
- The microphone's missing level was traced to macOS Voice Isolation.
- Missing notification banners across browsers were traced to macOS notification
  settings and its suppression during screen sharing/mirroring. Browser
  permission and a native `show` event alone do not prove a banner was visible.
- Native and bridged notification popups both worked with popups allowed.
  The relevant Social.Wiki workflow, `onclick` calling `window.navigate`, was
  separately verified. Relayed events still cannot cancel native default focus.

These observations are historical, not a guarantee for every browser version or
configuration. API coverage and limits live in the
[adapter README](../../../src/bridges/peripherals/README.md).
