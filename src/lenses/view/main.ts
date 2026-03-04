import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import {
  pageVersionSchema,
  sortPageVersions,
  type PageVersionObject,
} from "../utils/page-versions";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../../backend/status-pages";
import { parseAddress } from "../../backend/route";
import { annotationSchema, type AnnotationObject } from "../utils/schemas";
import { computeTrustAnnotationsByActor } from "../utils/trust";
import { defaultTrustedEditors } from "../utils/default-trusted-editors";
import { sortProtectionHistory } from "../utils/protection";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

const graffiti = new window.Graffiti();

let requestedAddress = "";
let requestedLensParams = new URLSearchParams();
let renderedAddress = "";
let currentContentKey = "";
let activeRenderVersion = 0;
let graffitiSession: GraffitiSession | undefined | null = undefined;
const transclude = document.querySelector("#transclude") as HTMLElement;

function setTranscludeSrcDoc(
  html: string,
  status: "loading" | "not-found" | "ok" | "error",
) {
  transclude.setAttribute(
    "id",
    status === "ok" ? bytesToHex(sha256(utf8ToBytes(html))) : status,
  );
  transclude.setAttribute("srcdoc", html);
}

setTranscludeSrcDoc(LoadingPage, "loading");

// Forward explicit transclude navigation requests to the parent
transclude.addEventListener("sw-transclude-navigate", (e) => {
  if (!(e instanceof CustomEvent) || typeof e.detail?.to !== "string") return;
  window.navigate(e.detail.to);
});

function emitLensOutput(
  status: "loading" | "not-found" | "ok" | "error",
  srcdoc?: string,
) {
  window.emit("sw-lens-output", { status, srcdoc });
}

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
      .filter(
        ([_, trust]) => trust === true || trust?.value.activity === "Trust",
      )
      .map(([actor]) => actor),
  );
  if (session?.actor) {
    trusted.add(session.actor);
  }
  return [...trusted];
}

async function getPageVersionsAndProtection(pageName: string) {
  const objects = new Map<string, PageVersionObject | AnnotationObject>();
  for await (const result of graffiti.discover([pageName], {
    anyOf: [
      pageVersionSchema(pageName),
      annotationSchema(["Protect", "Remove"]),
    ],
  } as const)) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (result.tombstone) {
      objects.delete(result.object.url);
    } else {
      objects.set(
        result.object.url,
        result.object as PageVersionObject | AnnotationObject,
      );
    }
  }

  const values = [...objects.values()];
  const pageVersions = sortPageVersions(
    values.filter((o): o is PageVersionObject => o.value.activity === "Update"),
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
    pageVersions.find((version) => trustedEditors.includes(version.actor)) ||
    null
  );
}

async function renderLens(options?: { force?: boolean }) {
  const address = requestedAddress;
  if (!address.length) return;

  const lensParams = requestedLensParams;
  const { name: pageName, hash: pageHash } = parseAddress(address);
  const requestedVersion = lensParams.get("version") ?? "";
  transclude.setAttribute("name", pageName);
  const contentKey = requestedVersion || pageName;

  if (
    !options?.force &&
    address === renderedAddress &&
    contentKey === currentContentKey
  ) {
    return;
  }

  if (!options?.force && contentKey === currentContentKey) {
    // If the rendered content target hasn't changed, only update the hash.
    renderedAddress = address;
    transclude?.setAttribute("hash", pageHash);
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
        emitLensOutput("not-found");
        setTranscludeSrcDoc(
          PageNotFound(address, window.topOrigin),
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

    const { hash: renderedPageHash } = parseAddress(renderedAddress);
    transclude?.setAttribute("hash", renderedPageHash);
  } catch (e) {
    if (renderVersion !== activeRenderVersion) return;
    emitLensOutput("error");
    setTranscludeSrcDoc(
      ErrorPage(e instanceof Error ? e.message : String(e)),
      "error",
    );
  }
}

async function onHashChange() {
  requestedAddress = window.address;
  requestedLensParams = new URLSearchParams(window.params);
  await renderLens();
}
window.addEventListener("addresschange", onHashChange);
window.addEventListener("paramschange", onHashChange);
void onHashChange();
