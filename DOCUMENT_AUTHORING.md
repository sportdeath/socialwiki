# Social.Wiki Document Authoring

Social.Wiki is a system for collaboratively editing interactive apps that may include social features like messaging, microblogging, collaborative canvases, ridesharing, and so on. This guide provides context for creating and editing Social.Wiki apps. Social.Wiki apps are implemented as single HTML documents without companion files. They can store and share data through a system called Graffiti and most use Vue for reactivity. For security, Social.Wiki sites are heavily sandboxed. The Social.Wiki browser and editor are also built as Social.Wiki documents.

This guide describes the Social.Wiki runtime, Graffiti's data model and API, and best practices.

## File Setup

- A Social.Wiki document must be one readable, runnable HTML file with no companion files.
- Include this in `<head>` before any other scripts:
  ```html
  <script src="https://social.wiki/init.js"></script>
  ```
  It sets up the runtime, defines `window.Graffiti` and other globals, and provides an import map for `"vue"` and `"@graffiti-garden/wrapper-vue"`
- Do not add your own import map. Use full CDN URLs for packages other than `"vue"` and `"@graffiti-garden/wrapper-vue"`
- Import each Vue helper you use from `"vue"` (such as `ref` or `computed`); there is no global `Vue`.
- HTML structure:
  ```html
  <!-- empty placeholder for mounting -->
  <div id="app">Loading...</div>
  <!-- Vue templates -->
  <template id="app-template">
    <my-component :my-prop="myValue"></my-component>
    ...
  </template>
  <template id="my-component-template">VUE CODE HERE</template>
  ```
- Script structure:
  ```js
  import { createApp } from "vue"
  import { GraffitiPlugin, useGraffiti, ... } from "@graffiti-garden/wrapper-vue"
  const MyComponent = {
    template: "#my-component-template",
    props: ["my-prop", ...],
    ...
  };
  function setup() {
    const graffiti = useGraffiti();
    ...
    return { myValue, ... };
  }
  ...
  createApp({
    template: "#app-template",
    setup,
    components: { MyComponent, ... },
    ...
  }).use(GraffitiPlugin, { graffiti: new window.Graffiti() })
    .mount("#app")
  ```

## Sandbox Restrictions

The document runs in a sandboxed originless iframe. Some browser functionalities are restored by <https://social.wiki/init.js> but others are unavailable.

- You MAY use the following when available; some require user permission or interaction:
  - Camera and microphone via `navigator.mediaDevices.getUserMedia()`
  - Device location via `navigator.geolocation`
  - Clipboard via `navigator.clipboard`
  - Notifications via `Notification`
  - `crypto.randomUUID()`, `crypto.getRandomValues()` and `crypto.subtle`
  - Local files via `<input type="file">` or `showOpenFilePicker()`, `showSaveFilePicker()`, and `showDirectoryPicker()`
  - Downloads are permitted via `<a href="..." download>`
- Do NOT use `window.location`, `window.origin`, or `window.open`
- Do NOT use cookies, `localStorage`, or `IndexedDB`. Use Graffiti for data persistence.
- Do NOT use service workers or push notifications.
- Do NOT use screen capture, audio output selection, Web Serial, WebUSB, Web Bluetooth, WebHID, Web MIDI, or Web NFC. Do not assume other device APIs work.
- External `fetch()` requests need the server to allow cross-origin requests; the document sends `Origin: null`.
- Some external iframe embeds may not work, such as YouTube embeds. Test before relying on them or link instead.

### Routing

- Do NOT use `window.location` for accessing or modifying route state. A document intentionally does not have access to its own location for portability. However, subroute information can be read/saved to the document's URL by getting/setting:
  - `window.address` (`string | undefined`) - main sub-address for a single-page application (SPA)
    - `window.addEventListener("addresschange", () => { window.address })`
  - `window.params` (`URLSearchParams`) - additional parameters for the app
    - `window.addEventListener("paramschange", () => { window.params })`
  - `window.query` (`string`) - the raw query string combining address and params; starts with `"?"` if not empty
    - `window.addEventListener("querychange", () => { window.query })`
    - `window.route.composeQuery(params?: URLSearchParams, address?: string): string`
    - `window.route.parseQuery(query: string): { params?: URLSearchParams; address?: string }`
- Route state may arrive after load; listen for changes.
- For query navigation on-click, use normal anchors: `<a :href="query">`. Clicks will not refresh the page.
- Avoid exposing users to raw query strings. For a non-empty `query`, `<a :href="query">` automatically translates queries into absolute links on New Tab / Copy Link actions. For programmatic copying, use `await window.copyLink(query)` in response to a user action to copy an absolute link to the clipboard.

### Navigation

- Do NOT use `window.location` or `window.open` for external navigation.
- For navigation-on-click, use normal anchors: `<a href="https://example.com">`
- For programmatic navigation: `window.navigate("https://example.com")`
- Also works for relative navigation: `window.navigate("?/profile")`

## Graffiti

### Data types

#### Graffiti Objects

`GraffitiObject` contains:

- `value`: freeform JSON. Use human-readable properties and values because system permission dialogs show them to users.
- `channels`: `string[]` (discoverable ONLY by querying channels)
- `allowed?: string[] | null` (omitted/undefined/null -> public; `[]` -> creator-only; list -> restricted to listed actors)
- `actor`: string (creator; only creator can delete)
- `url`: string (unique object identifier/locator)

#### Graffiti Media

`GraffitiMedia` contains:

- `data`: `Blob` (binary data plus media type)
- `actor`: string (uploader; only uploader can delete)
- `allowed?: string[] | null` (same as for objects)

#### Login Sessions

- `session`: `GraffitiSession`
  - `undefined` -> initializing (show "Loading...")
  - `null` -> logged out (show "Log in" button calling `graffiti.login()`)
  - `{ actor }` -> logged in (show "Log out" calling `graffiti.logout(session)`)
- Get session from `useGraffitiSession()` in Composition API or `this.$graffitiSession.value` in Options API.

#### Object Schemas

- Fetching Graffiti objects requires a JSON Schema that will filter for objects matching a specific shape.
- Using the schema `{}` will match everything, but DO NOT USE UNLESS NECESSARY.
- The schema applies to the whole object (`value`, `channels`, `allowed`, `actor`, `url`), not just `object.value`. Generally just filtering for `value` is OK, but filtering `actor` can be useful if you only want objects by a certain set of actors.
- Start from this shape:

  ```js
  { properties: { value: { /* Your value schema here */ } } }
  ```

### Graffiti API

You may use these methods; do not invent other APIs:

#### graffiti.post

```ts
post(
  partialObject: { value: {}, channels: string[], allowed?: string[] | null },
  session: GraffitiSession
) => Promise<GraffitiObject>
```

- Provide everything except `actor`/`url`; they are assigned and returned.

#### graffiti.get

```ts
get(
  url: string | { url: string },
  schema: JSONSchema,
  session?: GraffitiSession | null
) => Promise<GraffitiObject>
```

- Validates against required JSON schema.
- Fetches one object by its known URL; use discovery (below) to find multiple objects by channel.
- If `session` omitted, object must be public (`allowed` omitted/undefined/null).
- Only use `session` if you explicitly want to include private objects.
- If retriever != creator, `allowed`/`channels` are masked (BCC-like).

#### graffiti.delete

```ts
delete(
  url: string | { url: string },
  session: GraffitiSession
) => Promise<GraffitiObject>
```

- Only creator may delete.

#### graffiti.postMedia

```ts
postMedia(
  partialMedia: { data: Blob, allowed?: string[] | null },
  session: GraffitiSession
) => Promise<string>
```

- Returns media URL; media is NOT discoverable.

#### graffiti.getMedia

```ts
getMedia(mediaUrl: string, accept: { types?: string[], maxBytes?: number }, session?: GraffitiSession | null)
=> Promise<GraffitiMedia>
```

- Accept types are mime types (e.g. `image/*`, `text/plain`); if no match, call fails.
- `maxBytes` limits the accepted media size in bytes.
- Accept is REQUIRED even if you want to accept all types: `getMedia(url, {})`
- If `session` omitted, media must be public (`allowed` omitted/undefined/null).
- Only use `session` if you explicitly want to include private media.

#### graffiti.deleteMedia

```ts
deleteMedia(mediaUrl: string, session: GraffitiSession) => Promise<void>
```

- Only poster may delete.

#### graffiti.login

```ts
login() => Promise<void>
```

- Must be called from a user gesture (button).

#### graffiti.logout

```ts
logout(session: GraffitiSession) => Promise<void>
```

- Must be called from a user gesture (button).

#### graffiti.actorToHandle

```ts
actorToHandle(actor: string) => Promise<string>
```

- For display only; handles can change.

#### graffiti.handleToActor

```ts
handleToActor(handle: string) => Promise<string>
```

### Graffiti Vue Wrapper

Here, `Ref<T>` is a reactive value accessed with `.value` in JavaScript; `MaybeRefOrGetter<T>` accepts a value, ref, or getter.

#### Globals

- In templates / Options API:
  - `$graffiti` (Graffiti instance)
  - `$graffitiSession` (`Ref<GraffitiSession | null | undefined>`)
- Composition API:
  - `useGraffiti(): Graffiti`
  - `useGraffitiSession(): Ref<GraffitiSession | null | undefined>`

#### Composables (components are equivalent, but outputs come via `v-slot`)

##### useGraffitiDiscover

```ts
useGraffitiDiscover(
  channels: MaybeRefOrGetter<string[]>,
  schema: MaybeRefOrGetter<JSONSchema>,
  session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
  autopoll?: MaybeRefOrGetter<boolean>,
) => {
  isFirstPoll: Ref<boolean>;
  objects: Ref<GraffitiObject[]>;
  error: Ref<Error | null>;
  poll: () => Promise<void>;
}
```

- If `session` omitted, will only return public objects (`allowed` omitted/undefined/null).
- Only use `session` if you explicitly want to include private objects.
- Component `<graffiti-discover :channels="[...]" :schema="{...}" v-slot="{ objects, error, isFirstPoll, poll }">`
- Discovery automatically polls when first attached and when arguments change. Use `poll()` only for explicit refresh.
- `isFirstPoll` stays true until the first successful poll after a change of arguments; use it as a loading signal.
- If `error` is set, display it with "Retrying…" even while `isFirstPoll` is true; discover retries automatically until it clears.
- For ongoing updates from other people (e.g. messaging), enable `autopoll` on at most ONE discovery; it is resource heavy. Local posts/deletes propagate reactively to `objects`; no `autopoll` necessary.
- Discover calls are expensive. For per-item data (e.g. reactions), discover in batches. E.g. pass `() => posts.objects.value.map(post => post.url)` to a second `useGraffitiDiscover`; do not put a discovery in each repeated row.
- Pass an array of channels even for one channel: `:channels="['my-channel']"`

##### useGraffitiGet

```ts
useGraffitiGet(
  url: MaybeRefOrGetter<string | { url: string }>,
  schema: MaybeRefOrGetter<JSONSchema>,
  session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
) => {
  object: Ref<GraffitiObject | null | undefined>;
  error: Ref<Error | null>;
  poll: () => Promise<void>;
}
```

- If `session` omitted, will only return public objects (`allowed` omitted/undefined/null).
- Only use `session` if you explicitly want to include private objects.
- `object` is `undefined` while loading and `null` when no object is available. When `object` is `null`, `error === null` means not found; otherwise `error` contains the failure.
- Component equivalent: `<graffiti-get :url="url" :schema="{ ... }" v-slot="{ object, error, poll }">`

##### useGraffitiGetMedia

```ts
useGraffitiGetMedia(
  url: MaybeRefOrGetter<string>,
  accept: MaybeRefOrGetter<{ types?: string[], maxBytes?: number }>,
  session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
) => {
  media: Ref<GraffitiMedia & { dataUrl: string } | null | undefined>;
  error: Ref<Error | null>;
  poll: () => Promise<void>;
}
```

- A Graffiti media URL cannot go directly in `<img src>`. For ordinary display, use `<graffiti-get-media :url="url" :accept="{ ... }"></graffiti-get-media>`; it handles common media types and a download fallback.
- For custom rendering, use the composable's `media.dataUrl` or the component's `v-slot="{ media, error, poll }"`.
- `media` is `undefined` while loading and `null` when no media is available. When `media` is `null`, `error === null` means not found; otherwise `error` contains the failure.
- Accept is REQUIRED even if you want to accept all types. In that case `accept={}`
- If `session` omitted, will only return public media (`allowed` omitted/undefined/null).
- Only use `session` if you explicitly want to include private media.

##### useGraffitiActorToHandle

```ts
useGraffitiActorToHandle(
  actor: MaybeRefOrGetter<string>
) => { handle: Ref<string | null | undefined>; error: Ref<Error | null> }
```

- `handle` is `undefined` while loading and `null` when no handle is available. When `handle` is `null`, `error === null` means not found; otherwise `error` contains the failure.
- Component equivalent: `<graffiti-actor-to-handle :actor="actor" v-slot="{ handle, error }">`
- By default, the component displays the handle, so do not put anything inside the tags unless you want to do something with it.

##### useGraffitiHandleToActor

```ts
useGraffitiHandleToActor(
  handle: MaybeRefOrGetter<string>
) => { actor: Ref<string | null | undefined>; error: Ref<Error | null> }
```

- `actor` is `undefined` while loading and `null` when no actor is available. When `actor` is `null`, `error === null` means not found; otherwise `error` contains the failure.
- Component equivalent: `<graffiti-handle-to-actor :handle="handle" v-slot="{ actor, error }">`
- By default, the component displays the actor, so do not put anything inside the tags unless you want to do something with it.

### Mitigating System Prompts

Session-backed Graffiti actions may trigger the system to prompt the user for confirmation. Gets/discoveries without a session, or gets/discoveries that return only public data, do not prompt. Users may remember decisions for similar actions, such as posting or deleting objects with the same structure or similar media. Posting a private object/media file also permits later reads of that exact data.

To make your document usable under this model:

- Keep posted object shapes consistent so remembered decisions apply to similar posts/deletes.
- Make object properties and values human-readable because they appear in permission prompts. HTTP(S) links, Graffiti URLs and actors, UUIDs, and timestamps are displayed meaningfully.
- Start session-backed actions from a user interaction unless they continue a feature the user enabled. For example, post read receipts automatically only after the user opts in; record that choice in Graffiti so the document can find it on later visits.
- Most documents can rely on a parent document (a "browser") to provide a permissions button. A document providing its own navigation UI may call `window.showPermissions()` to open the system permissions manager.

### Channels and Privacy

- Choose stable channels derived from stable identifiers:
  - actor URI (e.g. for "my posts" feed)
  - object URL (e.g. for comments/likes on a post)
  - topic/page/space name (e.g. for a single shared space)
  - h3 for geolocation
  - other stable identifiers as needed
  - Do NOT use `window.location.href`. It is not available.
  - Actor/object/media URLs need no prefix. Use short custom prefixes such as `topic:` or `geolocation:`, not URLs (i.e. folksonomy, not the semantic web).
- Always pass channels as an array, even for one channel.
- Explain channel intent in comments.
- Remember: you cannot truly prevent others from posting to your channels outside your UI.
  - Mitigate by filtering displayed objects (e.g., only owner-authored posts) + schema constraints.
  - Treat values like timestamps and locations as untrusted. `actor` and `url` are unforgeable.

### Modifying and Deleting within Graffiti

- Objects cannot be changed, and only an object's creator can delete an object.
- To enable editing, post a new object describing the change, then discover and interpret in UI as appropriate; it does not replace the original object.
  - Example value: `{ action: 'Update post', "new content": "My edited content", post: "GRAFFITI_OBJECT_URL" }`
- To enable removal by non-owners, post a new object describing the removal and interpret it in your UI; it does not delete the original object.
  - Example value: `{ action: 'Remove post', post: "GRAFFITI_OBJECT_URL" }`
- Create additional objects to enable other forms of collaboration and moderation.

## Transclusion (most documents do not need this)

Transclusion is including one Social.Wiki document within another.

### Transclusion By Source

- A Social.Wiki document can be included within another Social.Wiki document by source HTML. Do NOT use a regular iframe. Use:
  ```html
  <sw-transclude :srcdoc="htmlString" :query="query"></sw-transclude>
  ```
- Attributes:
  - `srcdoc` supplies the child's HTML; `query` supplies the state available as the child's `window.query`.
  - `id` identifies the child for permissions; `name` is a human-readable label for permission prompts. `permission-scope="inherit"` shares the parent's permission scope; use it only for trusted children.
  - `autosize="height"`, `"width"`, or `"both"` resizes container to fit child content; bare `autosize` means both.
  - `route` controls how navigation from the embedded document affects the browser URL. Relative links start from the child's assigned location. It does not choose what loads.
    - Usually, if a transclude is selectively displayed at a given query (e.g. `"?/profile"`), use that query as the child's route: `<sw-transclude ... route="?/profile"></sw-transclude>`
    - Without `route`, query navigation updates only the embedded document, leaving the browser URL unchanged. Rooted and external navigation are ignored by default.
    - Use `route=""` when the child occupies the parent’s route, as in a transparent wrapper.
    - Use a route starting with `"#/"` to give the child an absolute route independent of its parent (see Sites below).
- `window.emit(type, detail)` sends from the child to its containing transclusion; `transclude.send(type, detail)` sends from parent to child. Cross-document event names must start with `"sw-"`. Listen on the receiving transclusion or `window` with `addEventListener` and read `event.detail`; call `event.preventDefault()` immediately to mark it handled. Unhandled events do not cross further document boundaries unless forwarded, for example:
  - `transclude.onUnhandledEvent = ({ type, detail }) => window.emit(type, detail)`
  - `window.onUnhandledEvent = ({ type, detail }) => transclude.send(type, detail)`

### Sites and Transclusion by Reference

- Social.Wiki documents are almost always published as "sites" which are identified by a "name" (`string`). A site's name and its query (`string`, empty if absent) combine to form that site's complete address (`string`):
  - `window.route.composeAddress(name: string, query: string): string`
  - `window.route.parseAddress(address?: string): { name: string; query: string }`
- A site does NOT know its own name or full address, only its query (`window.query`). `window.address` is a subaddress that is part of the document's query.
- Sites can be linked to through one of three built-in root "lenses": View (`v`), Edit (`e`), and History (`h`).
  - View simply displays the site, Edit opens the site up for editing, and History displays past site versions
  - `lensAddress = window.route.composeAddress("v", window.route.composeQuery(undefined, siteAddress))`
  - For an absolute location, the lens address must be prepended with the root symbol `"#/"`. This symbol refers to a top-level "browser" document that typically provides an address bar and selects View/Edit/History based on its provided address.
  - Navigation on-click: ``<a :href="`#/${lensAddress}`">``
  - Programmatic navigation: ``window.navigate(`#/${lensAddress}`)``
  - Copy absolute link: ``window.copyLink(`#/${lensAddress}`)``
- A site can be transcluded by reference via its address. The `src` attribute supersedes `srcdoc`; when `src` is set, its embedded query is used and the separate `query` attribute is ignored.
  - `<sw-transclude :src="siteAddress"></sw-transclude>`

### Custom lenses (uncommon, advanced)

- Lenses are regular Social.Wiki documents and new ones can introduce different moderation policies for collaborative editing.
- See the [View](https://social.wiki/view/index.html), [Edit](https://social.wiki/edit/index.html), and [History](https://social.wiki/history/index.html) documents for complete examples.
- A lens receives the site's address in `window.address` (parse it with `window.route.parseAddress`) and lens options in `window.params`.
- Site versions are public Graffiti objects with this shape:
  - `channels: ["site:" + siteName]`
  - `value: { action: "Publish site", "site name": siteName, changes: string, document: mediaUrl, time: number, "previous versions"?: string[] }`
  - `allowed` is omitted (public).
- A custom View lens selects which versions and publishers to trust. It transcludes the selected HTML with the site's query and `route=""`.
- Every lens reports `window.emit("sw-lens-output", { status, srcdoc })`, where `status` is `"loading"`, `"ok"`, `"not-found"`, or `"error"`. On `"ok"`, `srcdoc` is the source HTML displayed or edited. For asynchronous resolution, emit `"loading"` first and ignore stale results. If forwarding child events, consume their `sw-lens-output` rather than reporting it as the lens's own.

#### Custom navigation

- Links and `window.navigate()` in an embedded document send navigation requests to its parent. By default, the requesting element's `route` attribute controls how they are handled.
- `window.handleNavigation((to, childEl) => { ... })` replaces that default for this document's children. `to` is the requested destination; `childEl` is the requesting `<sw-transclude>` element.
- In the handler, call `childEl.navigate(to)` to apply a local query starting with `"?"` (updating its `src` or `query`), or `window.navigate(to)` to forward navigation to the parent.
- Example (local query navigation, other destinations forwarded):
  ```js
  window.handleNavigation((to, childEl) => {
    if (to.startsWith("?")) childEl.navigate(to);
    else window.navigate(to);
  });
  ```

### Custom browser (uncommon, advanced)

- A browser selects and transcludes a lens from its route. See the [existing browser lens](https://social.wiki/browser/index.html) for a complete example.
- Set `data-document-route="#/"` on the `init.js` script so `#/...` links resolve within the browser.

#### Custom resolution

- Normally, `<sw-transclude src="...">` resolves through the default View lens but a document may use `window.handleDocumentResolution((src, signal) => ...)` to choose another resolver for `src` transclusions in itself and its descendants. Typically only browsers need to use this.
  - The resolver returns `{ srcdoc: string, query: string }` or a Promise and should honor `signal` during asynchronous work.
  - Example: `src="Garden?/flowers"` resolves to `{ srcdoc: chosenViewLensHtml, query: "?/Garden?/flowers" }`. The lens displays Garden at `?/flowers`.

## Best Practices

### Design Process

1. Describe the core user journey and the interface needed to support it.
    - Use semantic interface elements when appropriate like calendars, maps, and canvases rather than exposing a generic data editor
2. Define the entities, actions, and views needed to implement the interface.
3. Define exactly which Graffiti object "types" you will use (e.g., Post, Like, Comment, Follow, etc.).
4. For each object type, define:
    - JSON schema (required fields, example)
      - Make as human-readable as possible
      - Duck-type objects by required properties (avoid `"type"`/`"kind"` properties for artifacts; use `"action"` for verbs)
      - Leave `additionalProperties` allowed for extensions
    - `allowed` policy (public vs private)
    - `channels` used (and why)
5. Identify which Graffiti methods, composables, and components you will use.
    - For methods with an optional session, decide if you need it for private objects or media.
6. Optional: identify state to store in route with `window.address`/`params`.
7. Implement UI that supports:
    - login/logout
    - creating objects with appropriate actions
    - discovering and displaying objects in appropriate views
    - any interactions like like/comment/delete
    - clear feedback states (loading/disabled buttons)

### Language / UX

- Keep UI copy non-technical, concise, and easy to understand.
- Do NOT expose technical jargon like "actor", "channel", "URI", or "JSON Schema" to end users.
  - Internally, use actor URIs as immutable user IDs.
  - Externally, display human-readable handles whenever you show identity.
  - Use `actorToHandle` / `handleToActor` (or their Vue wrappers) for translation.
- Use friendly UI labels: "user/account" instead of actor; "page/topic/space" instead of channel.
- In people-based apps, make first contacts discoverable (e.g., a directory, shared-space participants, or invite link). In cases where a handle must be entered, show the user their own handle as an example.
- Linkify user-generated text (posts, messages): recognize HTTP(S) URLs and site links beginning `#/`. Show the site name for links such as `#/v?/mysite` -> `<a href="#/v?/mysite">mysite</a>`:

  ```js
  const parts = text.split(/(https?:\/\/[^\s<>"']+|#\/[^\s<>"']+)/g); // odd-index parts are links
  function linkText(href) {
    if (!href.startsWith("#/")) return href;
    const { query } = window.route.parseAddress(href.slice(2));
    return window.route.parseQuery(query).address || href;
  }
  ```

  Render odd-index parts as `<a :href="part">{{ linkText(part) }}</a>` and the rest as text (not `v-html`).

- Do not add design explanations or excessive instructions into the UI. An app built with good usability principles should not need an instruction manual.
- Use loading states while awaiting async calls.
- Use optimistic rendering for interactions users may repeat while `graffiti.post` is in progress, such as sending messages or painting on a canvas. Show each new item immediately as pending, then remove that copy when `graffiti.post` finishes. For non-optimistic interactions, disable the button while posting to prevent duplicates.
- Handle failed posts, deletes, and media uploads visibly; remove or mark failed optimistic items. Report success only after required operations succeed.
- Ensure the app is responsive and renders well on mobile and desktop.

### Implementation

- Break out functionality into Vue components where appropriate.
- To reduce styling complexity, consider using semantic HTML and a classless CSS library and only apply styling on top as necessary.
- Social.Wiki is collaborative, so add comments throughout to clarify design decisions and reasoning to future authors.
- Keep the single HTML readable; do not minify code people will edit.
- Build shared views from discovered objects; in-memory component state will not survive reload or show others' updates.
- Test the HTML over HTTP(S), not `file://`, with `https://social.wiki/init-test.js`. Its accounts and data stay in your browser, so create as many test users and objects as needed. Check that the document mounts, external content loads, and its main interactions work, then restore `init.js` before publishing.

## Examples

### Waving

```html
<!doctype html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <!-- Connect the site to Social.Wiki -->
  <script src="https://social.wiki/init.js"></script>

  <!-- Better default styling -->
  <meta name="color-scheme" content="light dark" />
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"
  />

  <!-- Initialize Vue.js with Graffiti -->
  <script type="module">
    import { createApp } from "vue";
    import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

    createApp({
      template: "#template",
      data: () => ({
        processingWave: false,
        waveError: "",
        siteName: 'my-cool-site'
      }),
    }).use(GraffitiPlugin, { graffiti: new window.Graffiti() })
      .mount("#app");
  </script>
</head>

<body>
  <div id="app"><h1>Loading…</h1></div>

  <template id="template">
    <h1>Wave to Others!</h1>

    <!-- "Discover" any waves from this site -->
    <graffiti-discover
      v-slot="{ objects: waves, isFirstPoll, error }"
      :channels="['site:' + siteName]"
      :schema="{ properties: { value: {
        required: ['action', 'site name'],
        properties: {
          action: { const: 'Wave' },
          'site name': { const: siteName }
        }
      }}}"
    >
      <p v-if="error" role="status">Could not load waves: {{ error.message }}. Retrying…</p>
      <p v-if="waveError" role="status">{{ waveError }}</p>

      <p v-if="$graffitiSession.value === undefined">Checking your account…</p>
      <button v-else-if="$graffitiSession.value === null" @click="$graffiti.login()">
        Log in to wave!
      </button>

      <template v-else>
        <button v-if="isFirstPoll || processingWave" disabled>
          👋 Loading…
        </button>

        <!-- If you haven't waved yet, show "Wave" button -->
        <button
          v-else-if="!waves.some(
            wave => wave.actor === $graffitiSession.value.actor
          )"
          @click="
            processingWave = true;
            waveError = '';
            $graffiti.post(
              {
                value: { action: 'Wave', 'site name': siteName },
                channels: ['site:' + siteName],
              },
              $graffitiSession.value
            ).catch(error => {
              waveError = error.message || 'Could not wave.';
            }).finally(() => {
              processingWave = false;
            });
          "
        >
          👋 Wave!
        </button>

        <!-- If you have already waved, show "Unwave" button -->
        <button
          v-else
          @click="
            waves
              .filter(wave =>
                wave.actor === $graffitiSession.value.actor
              )
              .forEach(wave => {
                processingWave = true;
                waveError = '';
                $graffiti.delete(
                  wave,
                  $graffitiSession.value
                ).catch(error => {
                  waveError = error.message || 'Could not remove your wave.';
                }).finally(() => {
                  processingWave = false;
                });
              });
          "
        >
          👋 Unwave
        </button>
      </template>

      <p>
        {{ new Set(waves.map(w => w.actor)).size }} people have waved from this site.
      </p>
    </graffiti-discover>
  </template>
</body>
```

### Example objects

These are example objects to pass to `graffiti.post(object, session)`. Graffiti adds `actor` and `url`. The shapes and channels you use in your app are entirely up to you.

```js
const post = {
  value: {
    title: "My first post",
    content: "Hello, world!",
    time: Date.now(),
  },
  channels: ["topic:introductions"]
};

const reply = {
  value: {
    content: "I agree!",
    "in reply to": postedPost.url,
    time: Date.now()
  },
  channels: [postedPost.url]
};

const follow = {
  value: {
    action: "Follow account",
    account: actor,
  },
  // Discoverable through either account's channel
  channels: [session.actor, actor],
  // Readable only by the followed account and the creator
  allowed: [ actor ]
};
```

## Good-Faith Collaboration

When editing a site (a named document), remember that you may be overwriting work that someone else made. To avoid conflict and edit wars:
- When changing an existing feature, consider making it a setting. For example, introduce a dark mode toggle rather than simply making the whole site dark.
- If the reasonable default is not clear, consider introducing a setup wizard for new users.
- If settings/setup are not enough to reconcile, consider forking the site to a new name. A disambiguation page at the original name can link to different versions.

## References

- <https://github.com/sportdeath/socialwiki>
- <https://github.com/graffiti-garden/graffiti>
