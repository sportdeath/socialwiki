# Social.Wiki Document Authoring

Use this as background context when creating or editing Social.Wiki documents with Graffiti + Vue. It describes the runtime, data model, API shapes, and UX constraints that generated apps should follow.

OUTPUT RULES
- Output exactly ONE runnable HTML file in ONE code block.
- Include <script src="https://social.wiki/init.js"></script>. This defines window.Graffiti and provides an import map that lets you import from "vue" and related packages directly.
- HTML structure:
  <!-- empty placeholder for mounting -->
  <div id="app">Loading screen</div>
  <!-- Vue templates -->
  <template id="app-template">
    <my-component :my-prop="something"></my-component>
    ...
  </template>
  <template id="my-component-template">VUE CODE HERE</template>
- Script structure:
  import { createApp } from "vue"
  import { GraffitiPlugin, useGraffiti, ... } from "@graffiti-garden/wrapper-vue"
  createApp({
    template: "#app-template",
    setup() {
      const graffiti = useGraffiti();
      ...
    },
    components: {
      MyComponent: {
        template: "#my-component-template",
        props: ["my-prop", ...],
        ...
      },
      ...
    }
    ...
  }).use(GraffitiPlugin, { graffiti: new window.Graffiti() })
    .mount("#app")
- NO BUILD TOOLING.
- The document runs in a sandboxed originless iframe. Some browser functionalities are restored by <https://social.wiki/init.js> but others are unavailable.
  - Do NOT use cookies, localStorage, or IndexedDB. Use Graffiti for data persistence.
  - You may use the following when available; some require user permission or interaction:
    - Camera and microphone via navigator.mediaDevices.getUserMedia()
    - Device location via navigator.geolocation
    - Clipboard via navigator.clipboard
    - Notifications via Notification
    - crypto.randomUUID(), crypto.getRandomValues() and crypto.subtle
    - Local files via \<input type="file"> or showOpenFilePicker(), showSaveFilePicker(), and showDirectoryPicker()
    - Downloads are permitted via \<a href="..." download>
  - Do NOT use service workers or push notifications.
  - Do NOT use screen capture, audio output selection, Web Serial, WebUSB, Web Bluetooth, WebHID, Web MIDI, or Web NFC. Do not assume other device APIs work.
  - External fetch() requests need the server to allow cross-origin requests; the document sends Origin: null.
  - Some external iframe embeds may not work, such as YouTube embeds. Test before relying on them or link instead.

GRAFFITI OBJECT MODEL (must adhere)
GraffitiObject contains:
- value: freeform JSON. Use human-readable properties and values because system permission dialogs show them to users.
- channels: string[] (discoverable ONLY by querying channels)
- allowed?: string[] | null (omitted/undefined => public; empty [] => creator-only; list => restricted to listed actors)
- actor: string (creator; only creator can delete)
- url: string (unique object identifier/locator)

GRAFFITI MEDIA MODEL (must adhere)
GraffitiMedia contains:
- data: Blob (binary data plus media type)
- actor: string (uploader; only uploader can delete)
- allowed?: string[] | null (same as for objects)

LOGIN SESSIONS
- session: GraffitiSession
  - undefined => initializing (show "Loading...")
  - null => logged out (show "Log in" button calling graffiti.login())
  - { actor } => logged in (show "Log out" calling graffiti.logout(session))
- Get session from useGraffitiSession() in Composition API or this.$graffitiSession.value in Options API.

OBJECT SCHEMAS
- Fetching graffiti objects requires a JSON Schema that will filter for objects matching a specific shape.
- Using the schema {} will match everything, but DO NOT USE UNLESS NECESSARY.
- The schema applies to the whole object (value, channels, allowed, actor, url), not just object.value. Generally just filtering for value is OK, but filtering actor can be useful if you only want objects by a certain set of actors.
- Start from this base schema:
  - { properties: { value: { properties: {}, required: [] } } }

GRAFFITI API (use only these; respect the parameter/return shapes)
You may use these methods; do not invent other APIs:

- post(
    partialObject: { value: {}, channels: string[], allowed?: string[] | null },
    session: GraffitiSession
  ) => Promise<GraffitiObject>
  - Provide everything except actor/url; they are assigned and returned.

- get(
    url: string | { url: string },
    schema: JSONSchema,
    session?: GraffitiSession | null
  ) => Promise<GraffitiObject>
  - Validates against required JSON schema.
  - If session omitted, object must be public (allowed undefined).
  - Only use session if you explicitly want to include private objects.
  - If retriever != creator, allowed/channels are masked (BCC-like).

- delete(
    url: string | { url: string },
    session: GraffitiSession
  ) => Promise<GraffitiObject>
  - Only creator may delete.

- postMedia(
    partialMedia: { data: Blob, allowed?: string[] | null },
    session: GraffitiSession
  ) => Promise<string>
  - Returns media URL; media is NOT discoverable.

- getMedia(mediaUrl: string, accept: { types?: string[], maxBytes?: number }, session?: GraffitiSession | null)
  => Promise<GraffitiMedia>
  - Accept types are mime types (e.g. image/*, text/plain); if no match, call fails.
  - maxBytes limits the accepted media size in bytes.
  - Accept is REQUIRED even if you want to accept all types: getMedia(url, {})
  - If session omitted, media must be public (allowed undefined/null).
  - Only use session if you explicitly want to include private media.

- deleteMedia(mediaUrl: string, session: GraffitiSession) => Promise<void>
  - Only poster may delete.

- login() => Promise<void>
  - Must be called from a user gesture (button).

- logout(session: GraffitiSession) => Promise<void>
  - Must be called from a user gesture (button).

- actorToHandle(actor: string) => Promise<string>
  - For display only; handles can change.

- handleToActor(handle: string) => Promise<string>

VUE WRAPPER: GLOBALS + COMPOSITION HELPERS (use only these)
Here, Ref<T> is a reactive value accessed with .value in JavaScript; MaybeRefOrGetter<T> accepts a value, ref, or getter.
- In templates / Options API:
  - $graffiti (Graffiti instance)
  - $graffitiSession (Ref<GraffitiSession | null | undefined>)
- Composition API:
  - useGraffiti(): Graffiti
  - useGraffitiSession(): Ref<GraffitiSession | null | undefined>

VUE COMPOSABLE SHAPES (components are equivalent, but outputs come via v-slot)

1) useGraffitiDiscover(
     channels: MaybeRefOrGetter<string[]>,
     schema: MaybeRefOrGetter<JSONSchema>,
     session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
     autopoll?: MaybeRefOrGetter<boolean>,
   ) => {
     isFirstPoll: Ref<boolean>;
     objects: Ref<GraffitiObject[]>;
     poll: () => Promise<void>;
   }
   - If session omitted, will only return public objects (allowed undefined/null).
   - Only use session if you explicitly want to include private objects.
   - Component \<graffiti-discover :channels="[...]" :schema="{...}" v-slot="{ objects, isFirstPoll, poll }">
   - AUTOPOLL IS RESOURCE HEAVY and should be used AT MOST ONCE to enable real-time updates (e.g. messaging).
   - Local changes (post, delete) propagate to discover in real time by default and at no penalty; no autopoll is necessary.
   - YOU MUST PASS AN ARRAY OF CHANNELS EVEN IF YOU ARE ONLY LISTENING TO ONE: :channels="['my-channel']"

2) useGraffitiGet(
     url: MaybeRefOrGetter<string | { url: string }>,
     schema: MaybeRefOrGetter<JSONSchema>,
     session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
   ) => {
     object: Ref<GraffitiObject | null | undefined>;
     error: Ref<Error | null>;
     poll: () => Promise<void>;
   }
   - If session omitted, will only return public objects (allowed undefined/null).
   - Only use session if you explicitly want to include private objects.
   - object is undefined while loading and null when no object is available. When object is null, error === null means not found; otherwise error contains the failure.
   - Component equivalent: \<graffiti-get :url="url" :schema="{ ... }" v-slot="{ object, error, poll }">

3) useGraffitiGetMedia(
     url: MaybeRefOrGetter<string>,
     accept: MaybeRefOrGetter<{ types?: string[], maxBytes?: number }>,
     session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
   ) => {
     media: Ref<GraffitiMedia & { dataUrl: string } | null | undefined>;
     error: Ref<Error | null>;
     poll: () => Promise<void>;
   }
   - Also provides a dataUrl field for convenient media rendering.
   - media is undefined while loading and null when no media is available. When media is null, error === null means not found; otherwise error contains the failure.
   - Component equivalent: \<graffiti-get-media :url="url" :accept="{ ... }" v-slot="{ media, error, poll }">
   - Accept is REQUIRED even if you want to accept all types. In that case accept={}
   - By default, the component already displays most media types (images, PDF, audio, video, etc.) with a download button fallback. Unless you want to process the media itself, do not put template code inside the <graffiti-get-media></graffiti-get-media> tag.
   - If session omitted, will only return public media (allowed undefined/null).
   - Only use session if you explicitly want to include private media.

4) useGraffitiActorToHandle(
     actor: MaybeRefOrGetter<string>
   ) => { handle: Ref<string | null | undefined>; error: Ref<Error | null> }
   - handle is undefined while loading and null when no handle is available. When handle is null, error === null means not found; otherwise error contains the failure.
   - Component equivalent: \<graffiti-actor-to-handle :actor="actor" v-slot="{ handle, error }">
   - By default, the component displays the handle, so do not put anything inside the tags unless you want to do something with it.

5) useGraffitiHandleToActor(
     handle: MaybeRefOrGetter<string>
   ) => { actor: Ref<string | null | undefined>; error: Ref<Error | null> }
   - actor is undefined while loading and null when no actor is available. When actor is null, error === null means not found; otherwise error contains the failure.
   - Component equivalent: \<graffiti-handle-to-actor :handle="handle" v-slot="{ actor, error }">
   - By default, the component displays the actor, so do not put anything inside the tags unless you want to do something with it.

MITIGATING SYSTEM PROMPTS
Session-backed Graffiti actions may trigger the system to prompt the user for confirmation. Gets/discoveries without a session, or gets/discoveries that return only public data, do not prompt. Users may remember decisions for similar actions, such as posting or deleting objects with the same structure or similar media. Posting a private object/media file also permits later reads of that exact data.

To make your app usable under this model:
- Keep posted object shapes consistent so remembered decisions apply to similar posts/deletes.
- Make object properties and values human-readable because they appear in permission prompts. HTTP(S) links, Graffiti URLs and actors, UUIDs, and timestamps are displayed meaningfully.
- Start session-backed actions from a user interaction unless they continue a feature the user enabled. For example, post read receipts automatically only after the user opts in; record that choice in Graffiti so the app can find it on later visits.
  
ROUTE STATE
- Do NOT use window.location for state or navigation. A document does not have access to its own location but subroute information can be read/saved in the URL by getting/setting:
  - window.address (string | undefined) - main sub-address for a SPA
    - window.addEventListener("addresschange", () => { window.address })
  - window.params (URLSearchParams) - additional parameters for the app
    - window.addEventListener("paramschange", () => { window.params })
  - Route state may arrive after load; listen for changes.

APP DESIGN REQUIREMENTS (interpret from USER_REQUEST)
A) Extract and list: core entities, actions, and views.
B) Define exactly which Graffiti object "types" you will use (e.g., Post, Like, Comment, Follow, etc.).
C) For each object type, define:
   - JSON schema (required fields, example, make as human readable as possible)
   - allowed policy (public vs private)
   - channels used (and why)
D) Identify which Graffiti API methods you will use (by name).
   - For methods with an optional session, decide if you need it for private objects or media.
E) Identify which Vue wrappers you will use (composables/components) and where.
F) Optional: identify state to store in route with window.address/params.
G) Implement UI that supports:
   - login/logout
   - creating objects
   - discovering and displaying objects in appropriate views
   - any interactions like like/comment/delete
   - clear feedback states (loading/disabled buttons)

CHANNEL & PRIVACY STRATEGY (must be explicit)
- Choose stable channels derived from stable identifiers:
  - actor URI (e.g. for "my posts" feed)
  - object URL (e.g. for comments/likes on a post)
  - topic/page/space name (e.g. for a single shared space)
  - other stable identifiers as needed
  - Do NOT use location.href. It is not available.
- Always pass channels as an array, even for one channel.
- Explain channel intent in comments.
- Remember: you cannot truly prevent others from posting to your channels outside your UI.
  - Mitigate by filtering displayed objects (e.g., only owner-authored posts) + schema constraints.

MODIFYING OBJECTS AND DELETING
- Objects cannot be changed, and only an object's creator can delete an object.
- To enable editing, post a new object describing the change, then discover and interpret in UI as appropriate; it does not replace the original object.
  - Example value: { action: 'Update post', "new content": "My edited content", post: "GRAFFITI_OBJECT_URL" }
- To enable removal by non-owners, post a new object describing the removal and interpret it in your UI; it does not delete the original object.
  - Example value: { action: 'Remove post', post: "GRAFFITI_OBJECT_URL" }
- Create additional objects to enable other forms of collaboration and moderation.

IMPLEMENTATION REQUIREMENTS
- Implement: login/logout; discover and display appropriate objects; interface for creation of additional objects as needed.
- Use loading states and disable buttons while awaiting async calls.
- Keep UI copy non-technical, concise, semantic, and easy to understand.
- Use semantic HTML and a classless CSS library. Only apply additional styling as required by USER_REQUEST.
- Break out functionality into Vue components where appropriate.
- DOUBLE CHECK that you are passing an ARRAY OF CHANNELS, even if you are only using one: <graffiti-discover :channels="['my-channel']" ...>
- DOUBLE CHECK that your schemas are relative to the WHOLE OBJECT, not just the object's value: { properties: { value: { properties: {...}, required: [...] } } }

LANGUAGE / UX RULES (important)
- Do NOT expose technical jargon like "actor", "channel", "URI", or "JSON Schema" to end users.
  - Internally, use actor URIs as immutable user IDs.
  - Externally, display human-readable handles whenever you show identity.
  - Use actorToHandle / handleToActor (or their Vue wrappers) for translation.
- Use friendly UI labels: "user/account" instead of actor; "page/topic/space" instead of channel.
- Do not add design explanations or excessive labels into the UI. Instead use good usability principles to make the UI naturally usable.

OUTPUT FORMAT
A) "Design Summary" (<= ~25 lines):
   - object types
   - channel strategy
   - allowed/privacy strategy
   - Graffiti methods used (by name)
   - Vue wrappers used (composables/components)
   - polling strategy (where autopoll is used, if at all)
B) Then the complete single-file HTML app.
