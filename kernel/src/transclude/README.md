# Transclude

`<sw-transclude>` maintains one Social.Wiki document inside a sandboxed iframe.
It resolves a document, displays it, and attaches the bridges needed to
communicate across that iframe boundary.

## Element contract

```html
<sw-transclude
  src="#/v?/example"
  autosize="height"
  id="profile"
  name="Profile"
></sw-transclude>
```

The element supports:

- `src`: an address identifying a document that is passed to a document resolver.
- `srcdoc`: HTML for directly rendering a document by its source code when `src` is absent. Alternatively, when `src` is present, it may hold the output source code of the document resolved from `src`.
- `query`: state for a direct `srcdoc`; ignored when `src` is present because the query is part of the document address.
- `autosize`: `width`, `height`, `both`, or a bare attribute for both axes. Makes the containing element resize to fit the child document.
- `id` and `name`: these identify a document within the Graffiti guard. A document's ID hierarchy is used to identity that document for permissions purposes. The name should be human-readable.
- `status`: the current loading or document status, written by the element.

## Across the boundary

Capabilities such as Graffiti, navigation, and document resolution are restored
across iframe boundaries via ["Bridges"](../bridges/). The transclude code intentionally
does not implement this functionality itself and bridges are designed to be independent and modular.

## Events

`send(eventName, payload)` sends an event into the immediate child document,
which can listen with `window.addEventListener(eventName, listener)`.
Events emitted by that document via `window.emit(eventName, payload)` can be
observed with `transcludeEl.addEventListener(eventName, listener)`.

A transparent lens, like the View lens, may decide to propogate unhandled events in either direction, but forwarding is not enabled by default:

```ts
transclude.onUnhandledEvent = ({ type, detail }) => window.emit(type, detail);
window.onUnhandledEvent = ({ type, detail }) => transclude.send(type, detail);
```

Bridge handlers and ordinary event listeners run first. Calling
`preventDefault()` synchronously stops it from being sent to the corresponding `onUnhandledEvent`.

## Resolution and rendering

Transclude on its own does not understand a `src` such as `#/v?/example`. Document requests
are bubbled up until they are intercepted and a response it returned back down.

```text
src
 │
 ▼
document resolver
 │  { srcdoc, query, status }
 ▼
transclude frame
```

The kernel establishes a top-level resolver that understands three "lenses",
View (`v`), Edit (`e`), and History (`h`) which are returned and used to resolve
the rest of the address (such as `?/example` in the `src`, `#/v?/example`).

Any document can intercept resolution requests with `window.handleDocumentResolution()`
and act as the browser for its own descendants.
