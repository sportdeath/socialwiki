import { computed, createApp, onMounted, onScopeDispose, ref, watch } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import type { TranscludeElement } from "../../../kernel/src/transclude/element";
import { lensesUrl } from "../utils/locator";
import {
  siteStateSchema,
  normalizeSiteVersions,
  pickVersion,
  sortSiteVersions,
} from "../utils/site-versions";
import { sortProtectionHistory } from "../utils/protection";
import { isProtectionObject } from "../utils/schemas";
import { useTrustContext } from "../utils/use-trust-context";
import {
  ErrorPage,
  LoadingPage,
  SiteNotFound,
} from "../utils/status-pages";

const { parseAddress } = window.route;

const initUrl = new URL("init.js", lensesUrl).href;

// Update the containing document with this lens's status and HTML.
function emitLensOutput(status: string, srcdoc?: string) {
  window.emit("sw-lens-output", { status, srcdoc });
}

function setup() {
  const graffiti = useGraffiti();
  const { sessionReady, trustedEditors } = useTrustContext();
  const transclude = ref<TranscludeElement | null>(null);
  const displayed = ref({ html: LoadingPage, id: "loading" });
  const displayedSiteName = ref<string>();
  const siteQuery = ref("");
  const requestedAddress = ref(window.address);
  const requestedLensParams = ref(new URLSearchParams(window.params));
  const siteName = computed(() => parseAddress(requestedAddress.value).name);
  const { objects, isFirstPoll } = useGraffitiDiscover(
    () => (siteName.value ? [siteName.value] : []),
    () => siteStateSchema(siteName.value),
  );

  function showDocument(html: string, id: string) {
    displayed.value = { html, id };
  }

  onMounted(() => {
    const child = transclude.value;
    if (!child) throw new Error("Missing transclusion");
    // Continue unhandled events across View in both directions. Bridge
    // handlers and listeners can preventDefault() to stop either path.
    child.onUnhandledEvent = (event) => {
      window.emit(event.type, event.detail);
    };
    window.onUnhandledEvent = (event) => {
      child.send(event.type, event.detail);
    };
    // Only View reports which document it resolved. Consume nested lens
    // output so the generic event pass-through does not forward it.
    child.addEventListener("sw-lens-output", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  let renderedAddress = "";
  let currentContentKey = "";
  let activeRenderVersion = 0;

  async function renderLens(force = false) {
    if (!sessionReady.value) return;
    const address = requestedAddress.value;
    if (!address?.length) return;

    const { name, query } = parseAddress(address);
    const requestedVersion = requestedLensParams.value.get("version") ?? "";
    // The site or explicit version identifies the document; its query is
    // replaceable state within that document and should not reload it.
    const contentKey = requestedVersion
      ? `version:${requestedVersion}`
      : `site:${name}`;
    displayedSiteName.value = name;
    const editors = trustedEditors.value;
    if (!requestedVersion && (isFirstPoll.value || !editors)) {
      if (force || contentKey !== currentContentKey) {
        activeRenderVersion++;
        currentContentKey = "";
        renderedAddress = "";
        emitLensOutput("loading");
        showDocument(LoadingPage, "loading");
      }
      return;
    }

    if (!force && address === renderedAddress && contentKey === currentContentKey)
      return;
    if (!force && contentKey === currentContentKey) {
      renderedAddress = address;
      siteQuery.value = query;
      return;
    }

    renderedAddress = address;
    currentContentKey = contentKey;
    // A newer route may finish first; ignore this render's later results.
    const renderVersion = ++activeRenderVersion;
    emitLensOutput("loading");
    showDocument(LoadingPage, "loading");

    try {
      let mediaAddress = requestedVersion;
      if (!mediaAddress) {
        if (!editors) return;
        const values = objects.value;
        const siteVersions = sortSiteVersions(
          normalizeSiteVersions(values, name),
        );
        const protectionAnnotations = values
          .filter(isProtectionObject)
          .filter((object) => object.value["site name"] === name);
        const protectionHistory = sortProtectionHistory(
          protectionAnnotations,
          editors,
        );
        const isProtected =
          protectionHistory.at(0)?.value.action === "Protect site";
        const selectedVersion = pickVersion(
          siteVersions,
          editors,
          isProtected,
        );
        if (!selectedVersion) {
          emitLensOutput("not-found");
          showDocument(SiteNotFound(address, initUrl), "not-found");
          return;
        }
        mediaAddress = selectedVersion.value.document;
      }

      const media = await graffiti.getMedia(mediaAddress, {
        types: ["text/html"],
      });
      if (renderVersion !== activeRenderVersion) return;
      const html = await media.data.text();
      if (renderVersion !== activeRenderVersion) return;
      // The child's ID is a hash of its HTML. Changing the content resets
      // its Graffiti permission scope; changing only the query does not.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(html),
      );
      if (renderVersion !== activeRenderVersion) return;
      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      emitLensOutput("ok", html);
      showDocument(html, id);
      siteQuery.value = parseAddress(renderedAddress).query;
    } catch (error) {
      if (renderVersion !== activeRenderVersion) return;
      emitLensOutput("error");
      showDocument(
        ErrorPage(error instanceof Error ? error.message : String(error)),
        "error",
      );
    }
  }

  function onQueryChange() {
    requestedAddress.value = window.address;
    requestedLensParams.value = new URLSearchParams(window.params);
  }
  window.addEventListener("querychange", onQueryChange);
  onScopeDispose(() => {
    window.removeEventListener("querychange", onQueryChange);
    activeRenderVersion++;
  });

  watch(
    [objects, trustedEditors],
    () => {
      if (!requestedLensParams.value.get("version")) void renderLens(true);
    },
    { flush: "post" },
  );
  // Connecting a child replays login; watching the session object itself
  // would reload the child and repeat that login indefinitely.
  watch(
    [requestedAddress, requestedLensParams, isFirstPoll, sessionReady],
    () => void renderLens(),
    { immediate: true, flush: "post" },
  );

  return { transclude, displayedSiteName, siteQuery, displayed };
}

createApp({ template: "#app-template", setup })
  .use(GraffitiPlugin, { graffiti: new window.Graffiti() })
  .mount("#app");
