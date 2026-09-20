# Bridges

Bridges restore selected capabilities across Social.Wiki's sandboxed iframe
boundaries such as navigation, resolution, sizing, and a Graffiti connection.
Each capability has a `child` and a `parent` half. These names identify which
side installs the bridge, not the direction in which information or actions travel;
oftentimes information flows in both directions across a bridge.

Both sides use symmetric entry points such as `installEventsChild()` and
`installEventsParent()`. `./child.ts` and `./parent.ts` combine these individual
entry points into functions that install all child or parent bridges at once:
`installChildBridgeEndpoints` and `createParentBridgeEndpointInstaller`.

## Bridge Catalog

- `events`: a basic event channel used by higher-level bridges. Event names
  must begin with `sw-` so they cannot impersonate native DOM events.
- `navigation`: link handling across documents. Containers may replace the
  transclusion's default with `window.handleNavigation()`. A routed transclusion then
  composes query-relative navigation with its `route` and forwards it outward;
  an empty route forwards unchanged. An unrouted side transclusion instead
  calls `transclude.navigate()` to keep unhandled query-relative navigation
  local and ignores other unhandled destinations. The same route serializes
  native link affordances such as
  hover, copying, and opening a new tab. Fragment-only links (`#` or `#section`,
  but not a Social.Wiki route beginning `#/`) scroll within their own document.
- `resolution`: the ability for a document to be resolved according to Social.Wiki's lenses.
  Its default root policy displays every address through Social.Wiki's View lens.
- `autosize`: the ability for documents to adjust their size to fit their container
- `graffiti`: a [graffiti](https://github.com/graffiti-garden/graffiti) connection.
