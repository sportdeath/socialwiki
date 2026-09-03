# Transclude

`<sw-transclude>` displays one document inside another. The displayed document
runs in a sandboxed iframe, gets a Graffiti connection from its parent, and can
contain further `<sw-transclude>` elements of its own.

The important simplification is that the transclude element and frame do not
understand Social.Wiki addresses or lenses. The element asks its document's local
resolver to turn an address into a document, then concerns itself only with
displaying that document.

Here, **browser** is a role rather than a particular window. An ordinary document
forwards resolution to its parent. The root handles it with the default
resolver, while an intermediate document may override its resolver and act as a
browser for its descendants.

## The pieces

- `element.ts` defines the public `<sw-transclude>` element. It interprets the
  element's attributes, asks its resolver to resolve `src`, and redispatches
  events coming back from the displayed document.
- `frame.ts` owns the shadow root and physical iframe. It decides whether a
  query can be sent to the existing document or whether the iframe must be
  replaced, and owns the lifetime of the opaque bridge connection tied to that
  iframe.
- `index.ts` only installs the custom element.

The resolution bridge is under `bridges/resolution/`. Its child half forwards
to the immediate parent over the existing event bridge, its parent half serves
the containing document's resolver, and `default.ts` contains the root `v/e/h`
policy.

There is deliberately no separate `frame-runtime` layer. It had no lifetime or
state independent of the physical iframe and only forwarded nearly every
operation back to `frame.ts`. The reusable boundaries are the individual
bridge modules. Their parent composition supplies `frame.ts` only `send`,
`setQuery`, and `destroy`.

## Rendering a document

The usual flow is:

```text
<sw-transclude src="…">
        │
        │ send src as written
        ▼
document-local resolver
        │
        │ { srcdoc, query, status }
        ▼
TranscludeFrame.render(...)
        │
        ├─ same HTML: send the new query to the current iframe
        │
        └─ different HTML: create an iframe and attach its bridges
```

When `src` is present, `element.ts` sends it as written to the document-local
resolver. The embedded default sends it one boundary upward; an ordinary
parent does the same until a document handles it. Relative URL resolution therefore
belongs to the resolver rather than the sandboxed document. The kernel's
default resolver uses the navigation base captured before `init.ts` replaced
the original top-level document. A custom resolver may interpret relative
sources differently.

The resolver returns:

- `srcdoc`: the HTML to display;
- `query`: state to send into that document;
- `status`: the initial value for the transclude's `status` attribute.

The default resolver recognizes current Social.Wiki hash routes, chooses the
lens source, and separates the lens source from its query. This
policy is a fallback for standalone or downloaded documents. A document may provide
`window.socialWikiTransclusionResolver` to replace or wrap its forwarding or
root fallback for all transcludes it owns.

If there is no `src`, the element displays its `srcdoc` directly and does not
contact the document resolver. If neither is present, it displays the loading
page.

Resolution is asynchronous. The current document remains visible while its
replacement is resolved. `#renderVersion` ensures an old response cannot
replace a newer request or render after the element has been disconnected.
Superseding or disconnecting a request also aborts it, removing its response
listener from the current window.

## Document source and query state

The resolver's `srcdoc` describes the document loaded in the iframe. The
`query` is state within that document.

If only the query changes, `TranscludeFrame` keeps the iframe and sends the new
query into it. This preserves the document's JavaScript state and its bridge
connections. If the HTML changes, the frame destroys the old bridges and
iframe and creates a new set.

The `query` attribute is only used with a direct `srcdoc`, which has no address
in which to store that state. It is ignored when `src` is present, and is inert
when there is no `srcdoc`.

## Creating and replacing the iframe

`TranscludeFrame` owns a closed shadow root containing a loading iframe and,
when ready, the content iframe. On replacement it:

1. destroys the old bridges, removes the old iframe, and revokes its blob URL;
2. creates a sandboxed iframe and keeps it hidden while it loads;
3. uses a blob URL in a non-opaque top-level realm, or `srcdoc` in nested
   realms to avoid Firefox storage-partition problems;
4. connects the new iframe's Graffiti, event, resolution, navigation, and
   autosize bridges;
5. reveals it after `load`. Navigation resends the current query and Autosize
   resends its current mode when they observe that load.

The separate loading iframe prevents stale content or `about:blank` from being
shown while the new document loads.

## What crosses an iframe boundary

The parent bridge connector installs five independent capabilities for one
immediate parent/child boundary:

- **Graffiti:** the parent serves its Graffiti object to the child. The
  Graffiti parent side prepends this transclude's `{ id, name }` to every
  session source path. Each nested boundary does the same, so a complete path
  emerges naturally without a separate transclude-ID tracker.
- **Events:** the child calls `window.emit(name, payload)` to expose an event
  through its containing transclude. The same transport carries messages for
  the other bridges, and all of them are exposed as DOM events.
- **Resolution:** forwards the child's requests to this document's resolver and
  returns the resulting document over the shared event connection.
- **Navigation:** owns navigation requests, query updates, and the inherited
  base URL. The parent resends the current query when the iframe loads; the
  child requests its stable base once after coming online. A containing document
  can use `window.handleNavigation(callback)` to intercept navigation requests,
  with the originating transclude passed as the callback's second argument.
  Unhandled requests continue bubbling; a handler forwards one explicitly by
  calling `window.navigate(to)`.
- **Autosize:** the child reports its measured size and the parent applies the
  requested width or height to the `<sw-transclude>` host element. Its parent
  side observes the `autosize` attribute and resends the mode when the iframe
  loads.

An explicit element `id` becomes the Graffiti source ID. Without one, the
Graffiti bridge creates an ID that remains stable for that element's lifetime.
The optional `name` is the human-readable source label. Transclude itself does
not observe or track either attribute; the Graffiti bridge reads them when a
Graffiti call crosses the boundary. The kernel-created root transclude uses the
application pathname so its source remains stable across reloads and differs
between applications hosted at separate paths.

## Navigation through nested transcludes

Code in a displayed document calls `window.navigate(to)`. When that document
comes online, it requests its parent's base URL once. The child installs a
`<base>` for ordinary links and serves the same inherited value to its own
children. `window.navigate()` emits its argument unchanged so each containing
document can interpret or forward it in its own routing context.

Social.Wiki documents are originless. Their scripts, styles, images, and other
resources must therefore use absolute URLs; the runtime `<base>` is navigation
context, not a resource-loading mechanism. `init.js` captures the standalone
document's original base before wrapping it, and the bridge propagates that
stable value through the transclusion tree independently of resolution.

The navigation child emits the request outward so containing lenses can
reconstruct larger routes:

- A value beginning with `?` is captured by the lens containing that
  transclude. The lens incorporates it into its own route and passes the
  resulting navigation outward.
- A containing lens decides how a child address fits into its own route. It
  can call `window.navigate(to)` to pass the resulting address outward one
  boundary at a time.

At the root, `init-server.ts` applies the address to the actual browser
location. Internal Social.Wiki routes update the hash; other URLs navigate the
page normally.

This propagation is separate from transclusion resolution. Navigation asks to
change the browser's current location. Resolution asks the browser which
document a particular transclude should display.

## Events and lens output

Every child event is redispatched as a bubbling, composed `CustomEvent`
from `<sw-transclude>`. A containing lens can therefore listen to child events
without knowing about `postMessage`.

`sw-lens-output` is handled specially. Unless the element has
`ignore-lens-output`, its reported `status` and optional `srcdoc` are reflected
onto the transclude element. A container which owns its `srcdoc` can ignore this
reflection while still observing the bubbling event.

## Public attributes and method

- `src`: address to resolve through the document-local resolver; takes precedence
  over `srcdoc`;
- `srcdoc`: HTML used directly when `src` is absent;
- `query`: state sent to a direct `srcdoc`; ignored when `src` is present;
- `autosize`: `height`, `width`, `both`, or a bare attribute for both;
- `id` and `name`: Graffiti source identity and label;
- `ignore-lens-output`: prevents child lens output from replacing `srcdoc`;
- `status`: output describing the current loading or lens status.

`send(eventName, payload)` sends an arbitrary event into the current child
document using the same event bridge as query updates.

## What transclude deliberately does not own

Transclude does not know:

- which Social.Wiki lenses exist;
- how a route maps to a lens;
- where lens HTML is stored;
- which ancestor, if any, will ultimately resolve an address;
- Graffiti permission policy;
- a registry of open child windows.

Route and lens-source choices belong to a resolver, while permission policy
belongs to Graffiti and data-guard. No transclude-window registry or shared
top-origin setting is maintained. This leaves `<sw-transclude>` responsible
for one thing: maintaining a resolved document inside an iframe and carrying
a small set of capabilities across that boundary.
