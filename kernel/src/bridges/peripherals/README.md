# Peripherals bridge

> **TODO — SLOP WARNING:** The peripheral code has not been seriously evaluated
> by a human. Proceed with caution; it needs a thorough human review.

One Penpal connection per iframe carries peripheral requests, results, and
cancellation. A request-scoped `send` call carries adapter controls back to the
host through the same ancestor chain; sibling frames cannot address one another's
requests. Requests and open-document registrations use the same open/close
subscription lifecycle. API-specific adapters live in `adapters/`: geolocation,
media (camera/microphone), and local files. Add future adapters to the registry in `adapters/index.ts` without
duplicating transport, scope composition, permission UI, or lifecycle cleanup.

- `parent.ts` assigns the containing transclusion's scope with the same
  `bridges/source.ts` helpers used by Graffiti. Each endpoint owns its request
  IDs. Ancestor authority and `permission-scope="inherit"` are intentional.
- `child.ts` keeps callbacks local and relays descendant requests through the
  same connection. No function arguments are serialized.
- `host.ts` is the trusted broker: it validates adapter operations, asks for
  authorization, starts native work, and owns cancellation and revocation.
  AbortSignal ties each request's authorization, native cleanup, and pagehide
  listener to one lifetime. Adapter updates follow the browser's asynchronous
  callback contract. An adapter declares every permission its prepared operation
  needs; all must be granted before native work starts.
- `permissions.ts` remembers explicit Allow or Deny decisions by capability
  and full source-ID path in the top-level origin's localStorage. Names are
  display labels. If storage is unavailable, decisions last for this host
  session. No coordinates are persisted. Clearing/revoking a remembered grant
  in another tab also stops its active requests here.
- `ui.ts` renders the trusted host dialogs. Clicking outside an authorization
  request or pressing Escape denies that request without persisting a decision.
  Only an explicit Allow/Deny can be remembered.
  Its styles and the lenses import the same root `theme.css` color tokens.

The Social.Wiki browser lens provides the shield button in its address bar.
It only calls `window.showPeripheralPermissions()`: management and enforcement
remain in this bridge. That call opens the host's controls for the calling
document and its descendants; every ancestor composes its scope as usual.
The Permissions table only lists currently open document scopes and active
requests in this browser tab. Every iframe registers its scope through the
bridge, including idle documents that have not requested access this visit.
Registrations update with source attributes and are removed on teardown;
multiple frames sharing a scope keep it visible until the last one closes.
Closing a page hides its saved decisions without deleting them, so reopening
it restores those rows. An open ancestor does not expose historical descendants.
There is no floating host button. Other containers can use the same function
to provide their own entry point.

`init.ts` creates the native guarded service at the trusted root. Sandboxed
documents receive the required service through the child bridge and pass it
to their descendants. Transclusion needs no peripheral-specific behavior.
The browser lens contains only the shield presentation and its action.

Feature detection is synchronous. Each adapter reports its native host features;
`features.ts` carries that snapshot through the iframe's initial browsing-context
name, consumed and cleared by the child kernel before subsequent app scripts run.
The generic bridge `prepareFrame` hook runs before iframe navigation; transclude
knows nothing about individual capabilities. This metadata grants no authority.
Missing native file pickers stay absent, so ordinary `'showOpenFilePicker' in
window` checks work in Firefox/Safari. `getSupportedConstraints()` uses the host
snapshot and returns a fresh dictionary.

`navigator.permissions.query({ name })` supports geolocation, camera, and
microphone, with a PermissionStatus-shaped EventTarget, `state`, `onchange`, and
`change` listeners. Queries do not prompt. They combine the calling document's
site grant with the native browser grant; a pending site request is not a grant.
On engines that cannot query a particular native permission, only the site state
is available; the native operation still enforces browser/OS permissions.
Other permission names continue to use the browser's implementation.

## Geolocation adapter

Documents use the usual `getCurrentPosition(success, error, options)`,
`watchPosition(success, error, options)`, and `clearWatch(id)` methods on
`navigator.geolocation`. Watch IDs are returned synchronously; callbacks run
asynchronously. Options and the standard error codes/constants are preserved.
Position and coordinate values include `toJSON()` but are plain local objects,
not native branded `GeolocationPosition` instances.

The top-level browser must separately permit location access. A native watch
backs both calls so that even a pending one-shot can be released on teardown.
Watches survive nonterminal native errors such as timeouts. A browser denial,
host revocation, frame replacement/removal, self-navigation, or pagehide stops
the relevant native work. Cancellation also dismisses pending authorization.

The browser's location availability, OS permission, and acquisition timeout still
apply. See the [Geolocation specification](https://www.w3.org/TR/geolocation/).

## Camera and microphone adapter

`navigator.mediaDevices.getUserMedia({ audio, video })` returns a native receiving
`MediaStream`. Preview, `MediaRecorder`, Web Audio, and onward WebRTC consumers
use native tracks. A combined request asks once: “Allow this site to access your camera and
microphone?” Remembered decisions are checked first; the prompt asks only for
permissions still needed, and a remembered denial blocks the request. Both grants
are required before the native capture call. Remember this decision applies to
each permission in the prompt; decisions remain separate in the Permissions table. The browser/OS also controls access at the trusted host origin.

One native WebRTC connection sends media directly from the host to the requesting
leaf, even through nested documents. Penpal relays offer/answer and trickle ICE;
there is no custom media serialization and no STUN/TURN server. Browsers that
block local WebRTC candidates cannot use this bridge. Connection setup is bounded
to 30 seconds; a disconnect lasting 10 seconds ends capture. Waiting for a user to
answer the native device prompt has no deadline, as with ordinary getUserMedia.
If that prompt resolves after cancellation, its tracks are immediately stopped.

The host owns capture and transmission. Revoking either permission ends that
request's whole stream, including receiver clones. Stopping the final local track
of one kind stops that device; stopping the final kind closes the connection.
Navigation, frame teardown, pagehide, and failed transport also stop capture.
Separate getUserMedia calls have independent capture lifetimes.

Narrow hooks on MediaStreamTrack and MediaStream prototypes track only bridged
tracks, including `track.clone()` and `new MediaStream([track]).clone()`. Other
tracks retain native behavior. `applyConstraints()` is forwarded to the capture
track, with native error names and `OverconstrainedError.constraint` preserved.
`getSettings()`, `getCapabilities()`, and `getConstraints()` return cached host
capture metadata; constraint application and source mute/unmute refresh it.
Source mute/unmute is forwarded to receiving tracks and their clones.

`enumerateDevices()` returns device descriptions with `toJSON()` and input
`getCapabilities()`. `devicechange` works with listeners and `ondevicechange`.
Enumeration never opens a permission dialog. Until this scope has access it
exposes only anonymous defaults; labels, IDs, and capabilities learned by the
trusted host through a different document are not disclosed. After capture is
allowed, returned device IDs can be used directly in getUserMedia constraints.
Changing permissions also refreshes the device list.

Limits of API transparency:

- WebRTC encodes media: it can add latency, compression, and receiver adaptation.
  Host capture settings do not guarantee identical received dimensions/quality.
- Clones share the existing capture settings. While multiple tracks in a clone
  group are live, `applyConstraints()` rejects with `NotSupportedError` rather
  than silently changing every clone. Apply constraints before cloning, stop the
  other tracks, or request a separate capture. TODO: support independent clone
  constraints if a concrete use case warrants the additional complexity.
- `enabled` operates on receiving tracks. Disabling them silences/hides their
  output but does not release the host device. Use stop.
- Screen capture and audio-output selection are not bridged. The mediaDevices
  facade is an EventTarget, not a branded native MediaDevices instance.

The [media capture specification](https://www.w3.org/TR/mediacapture-streams/)
and [WebRTC specification](https://www.w3.org/TR/webrtc/) define the native APIs.
The earlier [portability results](../../../test/browser/peripherals/MEDIA.md)
cover the transport; actual browser tests of this integrated adapter are manual.

## Manual demo

Paste [examples/geolocation.html](../../../../examples/geolocation.html)
into the Social.Wiki editor. Its `init.js` URL targets the local development
server on port 5173; use the URL from your starter for another installation.
It requests a fix or watches updates using only standard geolocation calls,
plots the result on a coordinate grid, and uses no third-party map service.

Try denial, click-away dismissal, a remembered decision after reload, stop
watching, and revocation from the address-bar shield. The shared host/adapter
and lifecycle logic also have unit tests in `kernel/test/peripherals*.spec.ts`.

For camera/microphone, paste [examples/media.html](../../../../examples/media.html).
It offers camera, microphone, or both, a muted preview, microphone meter, a video
constraint control, and a five-second recording with explicit playback controls.
It uses only standard APIs and uploads nothing.

In Safari/Chromium/Firefox, try each device alone and both together, denial and
remembered choices, Stop, revoking either permission, and navigation while live.
Check that the browser's capture indicator clears after Stop/revocation (assuming
no other app is using that device). Also try recording, changing video width,
concurrent pages, and a nested transclusion. Unit tests use fake devices/peers to
check lifecycle and signaling; they do not establish real-browser media quality.


## File System adapter

Documents use `window.showOpenFilePicker(options)` (including `multiple`) and
`window.showSaveFilePicker(options)` and `window.showDirectoryPicker(options)`.
Returned file handles expose `kind`, `name`, `getFile()` and `createWritable(options)`.
All handles support `queryPermission`, `requestPermission`, and `isSameEntry`.
Directory handles support `getFileHandle`, `getDirectoryHandle`, `removeEntry`,
`resolve`, `entries`, `keys`, `values`, and `for await...of`. Iteration is pulled
one entry at a time; breaking the loop closes its native iterator. Handles from
other picker calls can be compared, resolved, or supplied as `startIn` within the
same permission scope. Opaque reference tokens use the existing source-ID scope
logic; possession of a token does not authorize a different scope. Native picker options and writable
options such as `keepExistingData` pass through to the browser. `getFile()`
returns a native `File` snapshot over Penpal's structured cloning; call it again
to observe a local editor's saves.

Writers are local native `WritableStream` instances backed by a host-side file
writer. They support `write`, `seek`, `truncate`, `close`, `abort`, `getWriter`,
and `ReadableStream.pipeTo`, with native stream locking and backpressure.
Strings, buffers, Blobs and structured write/seek/truncate commands reach the
native writer. Writes commit on close; abort discards uncommitted changes.

One shared “local files” permission gates each picker request. The browser then
asks the user which files to select and separately controls native read/write
permission. Native handles and writers never leave the trusted host. IDs are
local to each request; cross-request reference tokens are checked against the full permission scope. Revocation,
navigation, or frame teardown rejects pending operations and aborts open writers;
late picker results are discarded and late writer creation is aborted. A commit
already started cannot be undone. Previously returned File snapshots remain
readable, just as previously disclosed data cannot be revoked.

Commands are acknowledged immediately and their results arrive as updates on the
same Penpal subscription. Native permission prompts and disk operations therefore
have no 15-second RPC deadline. This requires no changes to the shared transport.
There is no standard handle-close method: dropping a reference stops application
use, while host permission revocation or document teardown ends access. Handles
are retained at the host until that request ends.

OPFS, workers, FileSystemObserver, and native handle storage/structured cloning
are not bridged. Handle facades cannot be stored as working handles in IndexedDB
and are not native-branded FileSystemHandle objects. Writers are WritableStreams
with file methods, not branded FileSystemWritableFileStream objects. Reloading
requires selecting files again; remembering a site permission does not persist
its handles. These are functional limitations for apps using persistent handles
or worker-based file access, not simply differences detectable by introspection.

Native file permissions are queried/requested through the handle methods. Site
revocation invalidates that request's handles: they report denied and must be
selected again to resume use. File operations still require native read/write
permission. Native picker support is required at the trusted host (HTTPS or
localhost); missing pickers remain absent in the document. The bridge cannot add
pickers to engines that lack them or bypass user activation. Call pickers and
operations that may prompt for write permission from a user action.

The [example](../../../../examples/filesystem.html) polls fresh snapshots to
follow external saves and writes only on explicit actions. Sync/conflict handling
belongs to the application, not the adapter; native file handles can become stale
if an editor replaces or moves a file. The Edit lens is not yet integrated.
See [Chrome's File System Access guide](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
and [writable stream options](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable).


## Compatibility workflow checks

[examples/peripheral-compatibility.html](../../../../examples/peripheral-compatibility.html)
uses ordinary browser calls for permission state changes, device selection,
file permission checks, directory iteration/resolution, handle comparison, and
stream piping. Paste it into the editor, or run the file test server and open
`http://127.0.0.1:52180/?app=compatibility` for three real nested transclusions.
Browser testing is manual. Tests cover host/child behavior with fake devices and
files; passing them is not a claim that codecs, picker activation, or every
third-party library have been validated in real browsers.
