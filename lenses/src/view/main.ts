import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { TranscludeElement } from "../../../kernel/src/transclude/element";
import { defaultTrustedEditors } from "../utils/default-trusted-editors";
import { distributionUrl } from "../utils/distribution";
import {
  pageVersionSchema,
  sortPageVersions,
  type PageVersionObject,
} from "../utils/page-versions";
import { sortProtectionHistory } from "../utils/protection";
import {
  annotationSchema,
  type AnnotationObject,
} from "../utils/schemas";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../utils/status-pages";
import { computeTrustAnnotationsByActor } from "../utils/trust";

const { composeAddress, composeQuery, parseAddress } = window.route;

// Make sure the transclude exists
const foundTransclude = document.querySelector<TranscludeElement>("#transclude");
if (!foundTransclude) {
  throw new Error("Missing #transclude");
}
const transclude = foundTransclude;

// Present unhandled child events as this transparent lens's own events.
transclude.onUnhandledEvent = (event) => {
  window.emit(event.type, event.detail);
};
// Reflect autosize attributes on View.
// The actual sizing and passthrough are handled by by continuing
// to bubble the autosize event via onUnhandledEvent above
window.addEventListener("sw-autosize-mode", (event) => {
  if (!(event instanceof CustomEvent)) return;

  const mode = event.detail?.mode;
  if (typeof mode === "string") {
    // The nested autosize bridge validates the attribute's value.
    transclude.setAttribute("autosize", mode);
  } else {
    transclude.removeAttribute("autosize");
  }
});
// Only the view lens reports which document it resolved. ignore-lens-output
// protects the inner element's attributes; cancellation also stops forwarding.
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

// Find all of the logged in actors trusted editors
async function getTrustedEditors() {
  const annotations = new Map<string, AnnotationObject>();
  const session = graffitiSession;

  // Only consult an actor-specific trust channel when an identity is known.
  // Anonymous viewers use only the distribution's default trusted editors.
  if (session) {
    for await (const result of graffiti.discover(
      [session.actor],
      annotationSchema(["Trust", "Untrust"], { actor: session.actor }),
    )) {
      if (result.error) {
        console.error(result.error);
      } else if (result.tombstone) {
        annotations.delete(result.object.url);
      } else {
        annotations.set(result.object.url, result.object);
      }
    }
  }

  const trustByActor = computeTrustAnnotationsByActor(
    [...annotations.values()],
    defaultTrustedEditors,
  );
  const trusted = new Set(
    [...trustByActor.entries()]
      .filter(
        ([, trust]) =>
          trust === true || trust.value.activity === "Trust",
      )
      .map(([actor]) => actor),
  );
  if (session) trusted.add(session.actor);
  return [...trusted];
}

async function getPageVersionsAndProtection(pageName: string) {
  const objects = new Map<string, PageVersionObject | AnnotationObject>();
  for await (const result of graffiti.discover([pageName], {
    anyOf: [
      pageVersionSchema(pageName),
      annotationSchema(["Protect", "Remove"]),
    ],
  })) {
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

// If the page is not protected, choose the most recent version.
// Otherwise, choose the most recent version produced by a trusted actor.
function pickVersion(
  pageVersions: PageVersionObject[],
  trustedEditors: string[],
  isProtected: boolean,
) {
  if (!isProtected) return pageVersions.at(0) ?? null;
  return (
    pageVersions.find((version) => trustedEditors.includes(version.actor)) ??
    null
  );
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
      const [trustedEditors, pageData] = await Promise.all([
        getTrustedEditors(),
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
        const initUrl = new URL("init.js", distributionUrl).href;
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
