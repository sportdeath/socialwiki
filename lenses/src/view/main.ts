import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { TranscludeElement } from "../../../kernel/src/transclude/element";
import { lensesUrl } from "../utils/locator";
import {
  pageStateSchema,
  pickVersion,
  sortPageVersions,
  type PageVersionObject,
} from "../utils/page-versions";
import { sortProtectionHistory } from "../utils/protection";
import type { AnnotationObject } from "../utils/schemas";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../utils/status-pages";
import { getTrustContext } from "../utils/trust";

const { composeAddress, composeQuery, parseAddress } = window.route;

// Make sure the transclude exists
const foundTransclude = document.querySelector<TranscludeElement>("#transclude");
if (!foundTransclude) {
  throw new Error("Missing #transclude");
}
const transclude = foundTransclude;

// Continue unhandled events across the View lens in both directions. Bridge
// handlers and ordinary listeners can preventDefault() to stop either path.
transclude.onUnhandledEvent = (event) => {
  window.emit(event.type, event.detail);
};
window.onUnhandledEvent = (event) => {
  transclude.send(event.type, event.detail);
};
// Only the view lens reports which document it resolved. Consume any nested
// lens output so the generic event pass-through does not forward it.
transclude.addEventListener("sw-lens-output", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

// Start a Graffiti connection
const graffiti = new window.Graffiti();

// Initialize state variables
let requestedAddress: string | undefined;
let requestedLensParams: URLSearchParams | undefined;
let renderedAddress = "";
let currentContentKey = "";
let activeRenderVersion = 0;
let graffitiSession: GraffitiSession | null = null;
let initialized = false;

function setTranscludeSrcDoc(html: string, status: string) {
  transclude.setAttribute(
    "id",
    // The ID of the transcluded document is a hash of its content.
    // This makes it so that when a page's content changes, its ID
    // changes, resetting permissions in the Graffiti data guard.
    status === "ok" ? bytesToHex(sha256(utf8ToBytes(html))) : status,
  );
  transclude.setAttribute("srcdoc", html);
}
setTranscludeSrcDoc(LoadingPage, "loading");

// Intercept navigation requests
window.handleNavigation((to) => {
  // Any relative navigation is passed-through to the containing document
  if (!to.startsWith("?")) {
    window.navigate(to);
    return;
  }

  // A query-only link belongs to the displayed page, not to this view lens.
  const { name: pageName } = parseAddress(requestedAddress);
  window.navigate(
    composeQuery(requestedLensParams, composeAddress(pageName, to)),
  );
});

// Update the containing document with this lens's status and HTML.
function emitLensOutput(status: string, srcdoc?: string) {
  window.emit("sw-lens-output", { status, srcdoc });
}

// Listen to Graffiti login/logout/initialized events
// and re-render as appropriate.
function renderForSessionChange() {
  if (!requestedAddress?.length) return;
  void renderLens(true);
}
graffiti.sessionEvents.addEventListener("login", (event) => {
  const detail = (event as GraffitiLoginEvent).detail;
  if (detail.error) {
    console.error("Error logging in:");
    console.error(detail.error);
    return;
  }
  const actorChanged = graffitiSession?.actor !== detail.session.actor;
  graffitiSession = detail.session;
  // Connecting the rendered page replays login for its new RPC host. Refresh
  // only when the actor changes, or rendering would restart itself forever.
  if (actorChanged) renderForSessionChange();
});
graffiti.sessionEvents.addEventListener("logout", (event) => {
  const detail = (event as GraffitiLogoutEvent).detail;
  if (detail.error) {
    console.error("Error logging out:");
    console.error(detail.error);
    return;
  }
  graffitiSession = null;
  renderForSessionChange();
});
graffiti.sessionEvents.addEventListener("initialized", (event) => {
  const detail = (event as GraffitiSessionInitializedEvent).detail;
  if (detail?.error) console.error(detail.error);

  if (initialized) return;
  initialized = true;
  renderForSessionChange();
});

async function getPageVersionsAndProtection(pageName: string) {
  const objects = new Map<string, PageVersionObject | AnnotationObject>();
  for await (const result of graffiti.discover(
    [pageName],
    pageStateSchema(pageName),
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }

    const object = result.object as PageVersionObject | AnnotationObject;
    if (result.tombstone) objects.delete(object.url);
    else objects.set(object.url, object);
  }

  const values = [...objects.values()];
  return {
    pageVersions: sortPageVersions(
      values.filter(
        (object): object is PageVersionObject =>
          object.value.activity === "Update",
      ),
    ),
    protectionAnnotations: values.filter(
      (object): object is AnnotationObject =>
        object.value.activity === "Protect" ||
        object.value.activity === "Remove",
    ),
  };
}

async function renderLens(force = false) {
  if (!initialized) return;
  const address = requestedAddress;
  if (!address?.length) return;

  const lensParams = requestedLensParams;
  const { name: pageName, query: pageQuery } = parseAddress(address);
  const requestedVersion = lensParams?.get("version") ?? "";
  // The page or explicit version identifies the document; its query is only
  // replaceable state within that document and should not reload it.
  const contentKey = requestedVersion || pageName;
  transclude.setAttribute("name", pageName);

  if (
    !force &&
    address === renderedAddress &&
    contentKey === currentContentKey
  ) {
    return;
  }

  if (!force && contentKey === currentContentKey) {
    renderedAddress = address;
    transclude.setAttribute("query", pageQuery);
    return;
  }

  renderedAddress = address;
  currentContentKey = contentKey;

  const renderVersion = ++activeRenderVersion;
  setTranscludeSrcDoc(LoadingPage, "loading");

  try {
    let mediaAddress = requestedVersion;

    if (!mediaAddress) {
      const [{ trustedEditors }, pageData] = await Promise.all([
        getTrustContext(graffiti, graffitiSession),
        getPageVersionsAndProtection(pageName),
      ]);
      // A newer route may finish first; never let this older request replace it.
      if (renderVersion !== activeRenderVersion) return;

      const protectionHistory = sortProtectionHistory(
        pageData.protectionAnnotations,
        trustedEditors,
      );
      const isProtected =
        protectionHistory.at(0)?.value.activity === "Protect";
      const selectedVersion = pickVersion(
        pageData.pageVersions,
        trustedEditors,
        isProtected,
      );

      if (!selectedVersion) {
        emitLensOutput("not-found");
        const initUrl = new URL("init.js", lensesUrl).href;
        setTranscludeSrcDoc(
          PageNotFound(address, initUrl),
          "not-found",
        );
        return;
      }

      mediaAddress = selectedVersion.value.result.media;
    }

    const media = await graffiti.getMedia(mediaAddress, {
      types: ["text/html"],
    });
    if (renderVersion !== activeRenderVersion) return;

    const html = await media.data.text();
    if (renderVersion !== activeRenderVersion) return;

    emitLensOutput("ok", html);
    setTranscludeSrcDoc(html, "ok");

    const { query } = parseAddress(renderedAddress);
    transclude.setAttribute("query", query);
  } catch (error) {
    if (renderVersion !== activeRenderVersion) return;
    emitLensOutput("error");
    setTranscludeSrcDoc(
      ErrorPage(error instanceof Error ? error.message : String(error)),
      "error",
    );
  }
}

function onQueryChange() {
  requestedAddress = window.address;
  requestedLensParams = new URLSearchParams(window.params);
  void renderLens();
}

window.addEventListener("querychange", onQueryChange);
onQueryChange();
