# Social.Wiki App-Building Context

Use this as background context when generating Social.Wiki apps with Graffiti + Vue. It describes the runtime, data model, API shapes, and UX constraints that generated apps should follow.

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
- The app will run in a sandboxed iframe. DO NOT USE localStorage, crypto, etc.

GRAFFITI OBJECT MODEL (must adhere)
GraffitiObject contains:
- value: freeform JSON but prefer Activity Vocabulary properties when appropriate.
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
  ) => Promise<GraffitiObjectBase>
  - Only creator may delete.

- postMedia(
    partialMedia: { data: Blob, allowed?: string[] | null },
    session: GraffitiSession
  ) => Promise<string>
  - Provide everything except actor; it is assigned and returned.
  - Returns media URL; media is NOT discoverable.

- getMedia(mediaUrl: string, accept: { types?: string[] }, session?: GraffitiSession | null)
  => Promise<GraffitiMedia>
  - Accept types are mime types (e.g. image/*, text/plain); if no match, call fails.
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
     objects: Ref<GraffitiObject<Schema>[]>;
     poll: () => Promise<void>;
   }
   - If session omitted, will only return public objects (allowed undefined/null).
   - Only use session if you explicitly want to include private objects.
   - Component <graffiti-discover :channels="[...]" :schema="{...}" ...>
     - Emits the same outputs through v-slot: { objects, isFirstPoll, poll }
   - AUTOPOLL IS RESOURCE HEAVY and should be used AT MOST ONCE to enable real-time updates (e.g. messaging).
   - Local changes (post, delete) propagate to discover in real time by default and at no penalty; no autopoll is necessary.
   - YOU MUST PASS AN ARRAY OF CHANNELS EVEN IF YOU ARE ONLY LISTENING TO ONE: :channels="['my-channel']"

2) useGraffitiGet(
     url: MaybeRefOrGetter<string | GraffitiObjectUrl>,
     schema: MaybeRefOrGetter<JSONSchema>,
     session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
   ) => {
     object: Ref<GraffitiObject<Schema> | null | undefined>;
     poll: () => Promise<void>;
   }
   - If session omitted, will only return public objects (allowed undefined/null).
   - Only use session if you explicitly want to include private objects.
   - object is undefined while loading, null if not found.
   - Component equivalent: <graffiti-get :url="url" :schema="{ ... }"> via v-slot: { object, poll }

3) useGraffitiGetMedia(
     url: MaybeRefOrGetter<string>,
     accept: MaybeRefOrGetter<GraffitiMediaAccept>,
     session?: MaybeRefOrGetter<GraffitiSession | null | undefined>,
   ) => {
     media: Ref<GraffitiMedia & { dataUrl: string } | null | undefined>;
     poll: () => Promise<void>;
   }
   - Also provides a dataUrl field for convenient media rendering.
   - media is undefined while loading, null if not found or accept mismatch.
   - Component equivalent: <graffiti-get-media :url="url" :accept="{ ... }" ...> via v-slot: { media, poll }
   - Accept is REQUIRED even if you want to accept all types. In that case accept={}
   - By default, the component already displays most media types (images, PDF, audio, video, etc.) with a download button fallback. Unless you want to process the media itself, do not put template code inside the <graffiti-get-media></graffiti-get-media> tag.
   - If session omitted, will only return public media (allowed undefined/null).
   - Only use session if you explicitly want to include private media.

4) useGraffitiActorToHandle(
     actor: MaybeRefOrGetter<string>
   ) => { handle: Ref<string | null | undefined> }
   - handle undefined while loading; null if not found.
   - Component equivalent: <graffiti-actor-to-handle :actor="actor"> via v-slot: { handle }
   - By default, the component will display the actor, so do not put anything inside the tags unless you want to do something with it.

5) useGraffitiHandleToActor(
     handle: MaybeRefOrGetter<string>
   ) => { actor: Ref<string | null | undefined> }
   - actor undefined while loading; null if not found.
   - Component equivalent: <graffiti-handle-to-actor :handle="handle"> via v-slot: { actor }
   - By default, the component will display the handle, so do not put anything inside the tags unless you want to do something with it.

DO NOT USE SESSION UNLESS NECESSARY (triggers system security dialog)
- Only use methods/composables/components with a session in response to a user action to avoid unexpected dialogs, especially during page load.
- For methods/composables/components with an optional session, leave session undefined unless you NEED to retrieve private objects or media. These are: get, getMedia, useGraffitiDiscover, <graffiti-discover>, useGraffitiGet, <graffiti-get>, useGraffitiGetMedia, <graffiti-get-media>.

ROUTE STATE
- YOU CANNOT USE window.location. To save info in the URL you may get/set:
  - window.address (string | undefined) - main sub-address for a SPA
    - window.addEventListener("addresschange", () => { window.address })
  - window.params (URLSearchParams | undefined)
    - window.addEventListener("paramschange", () => { window.params })
  - address/params are not set until after page load: use event listeners.

APP DESIGN REQUIREMENTS (interpret from USER_REQUEST)
A) Extract and list: core entities, actions, and views.
B) Define exactly which Graffiti object "types" you will use (e.g., Post, Like, Comment, Follow, etc.).
C) For each object type, define:
   - JSON schema (required fields, example, use Activity Vocabulary properties when possible)
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
- To enable editing, post { activity: "Update" } objects, discover them, and interpret them as updates to earlier objects.
- To enable deletion by non-owners, post { activity: "Remove" } objects, discover them, and interpret them as removals in your UI.
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
