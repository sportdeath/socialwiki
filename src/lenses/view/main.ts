import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { initLens, outputLensStatus } from "../../backend/lens-client";
import {
  pageVersionSchema,
  sortPageVersions,
  type PageVersionObject,
} from "../page-versions";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../../backend/status-pages";
import { annotationSchema, type AnnotationObject } from "../utils/schemas";
import { computeTrustAnnotationsByActor } from "../utils/trust";
import { defaultTrustedEditors } from "../utils/default-trusted-editors";
import { sortProtectionHistory } from "../utils/protection";

const graffiti = new window.graffiti();

let requestedAddress = "";
let requestedLensParams = new URLSearchParams();
let renderedAddress = "";
let currentContentKey = "";
let activeRenderVersion = 0;
let graffitiSession: GraffitiSession | undefined | null = undefined;
const transclude = document.querySelector("#transclude") as HTMLElement;

function hashStringId(value: string): string {
  // FNV-1a-ish 32-bit hash; deterministic and cheap (not cryptographic).
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `h-${(hash >>> 0).toString(36)}`;
}

function setTranscludeSrcDoc(
  html: string,
  status: "loading" | "not-found" | "ok" | "error",
) {
  transclude.setAttribute("id", status === "ok" ? hashStringId(html) : status);
  transclude.setAttribute("srcdoc", html);
}

setTranscludeSrcDoc(LoadingPage, "loading");

// Watch the transclude src attribute.
// If it changes, forward the navigation to the parent
const observer = new MutationObserver(() => {
  const to = transclude.getAttribute("src");
  if (to) window.navigate(to);
  // Delete it to avoid loops
  transclude.removeAttribute("src");
});
observer.observe(transclude, {
  attributes: true,
  attributeFilter: ["src"],
});

function maybeRenderForSessionChange() {
  if (!requestedAddress.length) return;
  void renderLens({ force: true });
}

graffiti.sessionEvents.addEventListener("initialized", (evt) => {
  const detail = (evt as GraffitiSessionInitializedEvent).detail;
  if (detail?.error) {
    console.error(detail.error);
  }

  // Null means "known logged out", undefined means "still initializing".
  if (graffitiSession === undefined) {
    graffitiSession = null;
    maybeRenderForSessionChange();
  }
});

graffiti.sessionEvents.addEventListener("login", (evt) => {
  const detail = (evt as GraffitiLoginEvent).detail;
  if (detail.error) {
    console.error("Error logging in:");
    console.error(detail.error);
    return;
  }
  graffitiSession = detail.session;
  maybeRenderForSessionChange();
});

graffiti.sessionEvents.addEventListener("logout", (evt) => {
  const detail = (evt as GraffitiLogoutEvent).detail;
  if (detail.error) {
    console.error("Error logging out:");
    console.error(detail.error);
    return;
  }
  graffitiSession = null;
  maybeRenderForSessionChange();
});

async function getTrustedEditors() {
  const trustAnnotationsByUrl = new Map<string, AnnotationObject>();
  const session = graffitiSession;
  if (session?.actor) {
    for await (const result of graffiti.discover(
      [session.actor],
      annotationSchema(["Trust", "Untrust"], { actor: session.actor }),
    )) {
      if (result.error) {
        console.error(result.error);
        continue;
      }
      if (result.tombstone) {
        trustAnnotationsByUrl.delete(result.object.url);
      } else {
        trustAnnotationsByUrl.set(result.object.url, result.object);
      }
    }
  }

  const trustByActor = computeTrustAnnotationsByActor(
    [...trustAnnotationsByUrl.values()],
    defaultTrustedEditors,
  );
  const trusted = new Set(
    [...trustByActor.entries()]
      .filter(([_, trust]) => trust === true || trust?.value.activity === "Trust")
      .map(([actor]) => actor),
  );
  if (session?.actor) {
    trusted.add(session.actor);
  }
  return [...trusted];
}

async function getPageVersionsAndProtection(pageName: string) {
  const objects = new Map<string, PageVersionObject | AnnotationObject>();
  for await (const result of graffiti.discover(
    [pageName],
    {
      anyOf: [pageVersionSchema(pageName), annotationSchema(["Protect", "Remove"])],
    } as const,
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (result.tombstone) {
      objects.delete(result.object.url);
    } else {
      objects.set(result.object.url, result.object as PageVersionObject | AnnotationObject);
    }
  }

  const values = [...objects.values()];
  const pageVersions = sortPageVersions(
    values.filter(
      (o): o is PageVersionObject => o.value.activity === "Update",
    ),
  );
  const protectionAnnotations = values.filter(
    (o): o is AnnotationObject =>
      o.value.activity === "Protect" || o.value.activity === "Remove",
  );

  return { pageVersions, protectionAnnotations };
}

function pickVersion(
  pageVersions: PageVersionObject[],
  trustedEditors: string[],
  isProtected: boolean,
) {
  if (!isProtected) return pageVersions.at(0) || null;
  return (
    pageVersions.find((version) => trustedEditors.includes(version.actor)) || null
  );
}

async function renderLens(options?: { force?: boolean }) {
  const address = requestedAddress;
  if (!address.length) return;

  const lensParams = requestedLensParams;
  const url = new URL(address, "http://example.com");
  const requestedVersion = lensParams.get("version") ?? "";
  const pageName = url.pathname.slice(1);
  transclude.setAttribute("name", pageName);
  const contentKey = requestedVersion || pageName;

  if (!options?.force && address === renderedAddress && contentKey === currentContentKey) {
    return;
  }

  if (!options?.force && contentKey === currentContentKey) {
    // If the rendered content target hasn't changed, only update the hash.
    renderedAddress = address;
    transclude?.setAttribute("hash", url.hash);
    return;
  }

  renderedAddress = address;
  currentContentKey = contentKey;

  // Wait until session state is known before applying trust/protection rules.
  if (!requestedVersion.length && graffitiSession === undefined) {
    setTranscludeSrcDoc(LoadingPage, "loading");
    return;
  }

  const renderVersion = ++activeRenderVersion;
  setTranscludeSrcDoc(LoadingPage, "loading");

  try {
    let mediaAddress = requestedVersion;

    if (!mediaAddress.length) {
      const [trustedEditors, pageData] = await Promise.all([
        getTrustedEditors(),
        getPageVersionsAndProtection(pageName),
      ]);
      if (renderVersion !== activeRenderVersion) return;

      const protectionHistory = sortProtectionHistory(
        pageData.protectionAnnotations,
        trustedEditors,
      );
      const isProtected = protectionHistory.at(0)?.value.activity === "Protect";

      const selectedVersion = pickVersion(
        pageData.pageVersions,
        trustedEditors,
        isProtected,
      );
      if (!selectedVersion) {
        outputLensStatus("not-found");
        setTranscludeSrcDoc(
          PageNotFound(address, window.topOrigin),
          "not-found",
        );
        return;
      }

      mediaAddress = selectedVersion.value.result.media;
    }

    const media = await graffiti.getMedia(mediaAddress, { types: ["text/html"] });
    if (renderVersion !== activeRenderVersion) return;

    const html = await media.data.text();
    if (renderVersion !== activeRenderVersion) return;

    outputLensStatus("ok", html);
    setTranscludeSrcDoc(html, "ok");

    const currentUrl = new URL(renderedAddress, "http://example.com");
    transclude?.setAttribute("hash", currentUrl.hash);
  } catch (e) {
    if (renderVersion !== activeRenderVersion) return;
    outputLensStatus("error");
    setTranscludeSrcDoc(
      ErrorPage(e instanceof Error ? e.message : String(e)),
      "error",
    );
  }
}

initLens(async (pageAddress, lensParams) => {
  requestedAddress = pageAddress;
  requestedLensParams = new URLSearchParams(lensParams);
  await renderLens();
});
