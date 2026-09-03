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

- `events`: a basic event channel used by higher-level bridges.
- `navigation`: the ability for links clicked on in one document to make a change at a higher-level document.
- `resolution`: the ability for a document to be resolved according to Social.Wiki's lenses.
  Its default root policy recognizes Social.Wiki's `v`, `e`, and `h` lenses.
- `autosize`: the ability for documents to adjust their size to fit their container
- `graffiti`: a [graffiti](https://github.com/graffiti-garden/graffiti) connection.
