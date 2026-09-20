# Peripherals bridge

One Penpal connection per iframe carries peripheral requests, results, and
cancellation. Requests and open-document registrations use the same open/close
subscription lifecycle. API-specific adapters live in `adapters/`; geolocation is the
first. Add future adapters to the registry in `adapters/index.ts` without
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
  callback contract.
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

This adapter does not patch `navigator.permissions.query()`; the native
Permissions API in an opaque iframe does not represent the bridge's grant.
Applications should request location normally and handle its success/error
callbacks. The browser's location availability, OS permission, and acquisition
timeout still apply. See the [Geolocation specification](https://www.w3.org/TR/geolocation/).

## Manual demo

Paste [examples/geolocation.html](../../../../examples/geolocation.html)
into the Social.Wiki editor. Its `init.js` URL targets the local development
server on port 5173; use the URL from your starter for another installation.
It requests a fix or watches updates using only standard geolocation calls,
plots the result on a coordinate grid, and uses no third-party map service.

Try denial, click-away dismissal, a remembered decision after reload, stop
watching, and revocation from the address-bar shield. The shared host/adapter
and lifecycle logic also have unit tests in `kernel/test/peripherals*.spec.ts`.
