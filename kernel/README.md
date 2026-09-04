# Social.Wiki Kernel

The Social.Wiki kernel provides a runtime that enables Social.Wiki documents
to securely "transclude" each other (include one document within another),
while preserving capabilities like navigation, frame sizing, and a connection
to the Graffiti database.

## Usage

Include the kernel near the beginning of a document's `<head>`, before any
module scripts:

```HTML
<script src="https://social.wiki/init.js"></script>
```

It can also be loaded from the npm package through a CDN:

```HTML
<script src="https://cdn.jsdelivr.net/npm/social-wiki@latest/dist/init.js"></script>
```

## Runtime API

Social.Wiki documents receive:

- `<sw-transclude>`, a web component for including sub-documents. See [Transclude](src/transclude/README.md) for details.
- `window.Graffiti` for posting and discovering social data. See the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html) for usage.
- `window.emit(eventName, payload)` for sending events to the containing document.
- `window.navigate(to)` for requesting navigation to a new route. 
- `window.handleNavigation(onNavigate)` for intercepting navigation requests.
- `window.query`, `window.params`, and `window.address` for reading and changing the current route.
- `window.route.parseAddress`, `window.route.parseQuery`, `window.route.composeAddress`, and `window.route.composeQuery` for parsing and composing routes.
- `window.handleDocumentResolution(documentResolver)` for intercepting document resolution requests.

## Sandboxing

Transcluded documents have opaque origins. They cannot depend on the embedding
page's `window.location`, any origin storage (local storage, cookies, indexDB),
or direct access to ancestor windows. They use the kernel APIs above for navigation,
resolution, events, and Graffiti.

Scripts, styles, images, and other resources must use absolute URLs. The kernel
provides an inherited `<base>` for ordinary links, but it is not a resource
loading mechanism.

Peripheral inputs like location, microphone, camera, and serial access are currently not available
to sandboxed documents, but support will likely be added in the near future (TODO).

## Development

```sh
npm test
npm run check
npm run build
```
