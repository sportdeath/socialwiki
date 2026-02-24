import { initLens, outputLensStatus } from "../../backend/lens-client";
import { getPageVersions } from "../../backend/page-versions";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../../backend/status-pages";

const graffiti = new window.graffiti();

let currentAddress = "";
let currentContentKey = "";
let activeRenderVersion = 0;
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

function normalizeEditorParams(lensParams: URLSearchParams) {
  return lensParams
    .getAll("editor")
    .map((editor) => editor.trim())
    .filter((editor) => editor.length > 0);
}

async function resolveEditors(editors: string[]) {
  const resolved = await Promise.all(
    editors.map(async (editor) => {
      if (editor.startsWith("did:")) return editor;
      return graffiti.handleToActor(editor);
    }),
  );

  return [...new Set(resolved)];
}

initLens(async (pageAddress, lensParams) => {
  const address = pageAddress;
  const url = new URL(address, "http://example.com");
  const requestedVersion = lensParams.get("version") ?? "";
  const requestedEditors = normalizeEditorParams(lensParams);
  const pageName = url.pathname.slice(1);
  const contentKey = requestedVersion || `${pageName}|${requestedEditors.join("|")}`;

  if (address === currentAddress && contentKey === currentContentKey) return;
  currentAddress = address;

  if (contentKey === currentContentKey) {
    // If the rendered content target hasn't changed, only update the hash.
    transclude?.setAttribute("hash", url.hash);
    return;
  }
  currentContentKey = contentKey;
  const renderVersion = ++activeRenderVersion;

  setTranscludeSrcDoc(LoadingPage, "loading");

  try {
    let mediaAddress = requestedVersion;
    if (!mediaAddress.length) {
      const editors = await resolveEditors(requestedEditors);
      if (renderVersion !== activeRenderVersion) return;

      const pageVersions = await getPageVersions(graffiti, pageName, editors);
      if (renderVersion !== activeRenderVersion) return;

      const potentialPageVersion = pageVersions.at(0);
      if (!potentialPageVersion) {
        outputLensStatus("not-found");
        setTranscludeSrcDoc(PageNotFound(address, window.topOrigin), "not-found");
        return;
      }

      mediaAddress = potentialPageVersion.value.result.media;
    }

    const media = await graffiti.getMedia(
      mediaAddress,
      {
        types: ["text/html"],
      },
    );
    if (renderVersion !== activeRenderVersion) return;

    const html = await media.data.text();
    if (renderVersion !== activeRenderVersion) return;

    outputLensStatus("ok", html);
    setTranscludeSrcDoc(html, "ok");

    const currentUrl = new URL(currentAddress, "http://example.com");
    transclude?.setAttribute("hash", currentUrl.hash);
  } catch (e) {
    if (renderVersion !== activeRenderVersion) return;
    outputLensStatus("error");
    setTranscludeSrcDoc(
      ErrorPage(e instanceof Error ? e.message : String(e)),
      "error",
    );
  }
});
