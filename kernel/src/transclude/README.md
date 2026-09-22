# Transclude

`<sw-transclude>` maintains one Social.Wiki document inside a sandboxed iframe.
It resolves a document, displays it, and attaches the bridges needed to
communicate across that iframe boundary.

## Element contract

```html
<sw-transclude
  src="my-cool-profile"
  route="?/profile"
  autosize="height"
  id="profile"
  name="Profile"
></sw-transclude>
```

The element supports:

- `src`: an address identifying a document that is passed to a document resolver.
  This should be equivalent to the string found in Social.Wiki's browser address bar.
  If the `src` starts with `?`, the parameters preceding the first `/` are passed
  to the resolving lens. For example, the default View lens will interpret
  `?version=media-id/example` as a specific version of the page named "example".
- `srcdoc`: HTML for directly rendering a document by its source code. `srcdoc` is only used when
  `src` is absent.
- `query`: state passed to a page for a direct `srcdoc`, such as
  `query="?/mysubpage"`.
  When `src` is present query is not used as the query is implicitly contained in the
  src, e.g. `src="mypage?/mysubpage"`
- `route`: the child's public route. For example if the page
  `#/v?/mypage` transcludes the document `src="theias-cool-page"` from the query `?/theia`,
  setting `route="?/theia"` ensures that relative routes
  within the transcluded document resolve appropriately to something like
  `#/v?/mypage?/theia?internal-param=something`. Relative routes always use
  their canonical `?/...` form; bare address shorthand is not accepted. A
  rooted value such as `route="#/v?/theia"` gives the child an absolute public
  route instead of nesting it beneath the containing document. This allows a
  containing document to handle ordinary navigation locally while copied and
  new-tab links still identify the child's standalone location. A literal page
  name beginning with `#/` remains available as a relative route such as
  `route="?/#/page"`. An empty value (`route=""`) passes through the containing
  document's route unchanged.
  When no `route` attribute is present, the child is a "side transclusion":
  it can still navigate internally but has no containing route for serializing
  relative links into browser URLs.
- `autosize`: `width`, `height`, `both`, or a bare attribute for both axes. Makes the containing element resize to fit the child document.
- `id` and `name`: these identify a document within the Graffiti guard. A document's ID hierarchy is used to identify that document for permissions purposes. The name should be human-readable.
- `permission-scope="inherit"`: omits this boundary from Graffiti's source hierarchy, giving the child the containing document's permission scope. Because this delegates the parent's authority to the child, it must only be set by a parent that trusts the transcluded document. Unknown values retain the normal isolated scope.

## Sizing and scrolling

A transclusion is a separate document with its own scrolling, like an iframe.
By default, it is a block with `width: 100%`, `height: 100%`, and
`min-height: 150px`. Percentage height needs a parent with a definite height;
otherwise the frame can end up only 150px tall. It does not automatically grow
to fit its contents.

For content embedded in a longer page, use `autosize="height"` so the containing
page handles scrolling:

```html
<sw-transclude src="my-page" autosize="height"></sw-transclude>
```

For a full-page app, give the frame a definite height and remove the wrapping
page's default body margin. Each intermediate wrapper should use this layout,
leaving the innermost app to scroll:

```html
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; }
  sw-transclude { height: 100%; }
</style>
<sw-transclude src="my-app"></sw-transclude>
```

Do not combine viewport-height frames with wrapper margins or padding: the
wrapper will overflow too, producing nested scrollbars. Autosizing only controls
the selected axes; other explicit dimensions are preserved.

## Across the boundary

Capabilities such as Graffiti, navigation, and document resolution are restored
across iframe boundaries via ["Bridges"](../bridges/). The transclude code intentionally
does not implement this functionality itself and bridges are designed to be independent and modular.

## Events

`send(eventName, payload)` sends an event into the immediate child document,
which can listen with `window.addEventListener(eventName, listener)`.
Events emitted by that document via `window.emit(eventName, payload)` can be
observed with `transcludeEl.addEventListener(eventName, listener)`.
Every bridged event name must begin with `sw-`; this keeps synthetic events
from colliding with native DOM events such as `click` or `submit`.

A transparent lens, like the View lens, may decide to propagate unhandled events
in either direction, but forwarding is not enabled by default:

```ts
transclude.onUnhandledEvent = ({ type, detail }) => window.emit(type, detail);
window.onUnhandledEvent = ({ type, detail }) => transclude.send(type, detail);
```

## Navigation

Navigation requests can be intercepted with `window.handleNavigation()`, otherwise
they are performed according to the `route` attribute.

The handler receives both the requested destination and the transclusion that
requested it. `transclude.navigate()` applies a relative query locally and
reflects it into `src` or `query`; `window.navigate()` sends a request upward:

```ts
window.handleNavigation((to, transclude) => {
  if (to.startsWith("?")) transclude.navigate(to);
  else window.navigate(to);
});
```

## Resolution and rendering

Transclude on its own does not interpret a `src` such as `example?/profile`.
Document requests are bubbled up until they are intercepted and a response is
returned back down.

```text
src
 │
 ▼
document resolver
 │  { srcdoc, query }
 ▼
transclude frame
```

The kernel establishes a top-level fallback resolver that delegates the complete `src`
address to its packaged View lens. Documents can replace this resolver with
alternative View lenses to introduce different governance into the system.

Any document can intercept resolution requests with `window.handleDocumentResolution()`
and act as the browser for its own descendants.
