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
transclude.setAttribute("srcdoc", LoadingPage);

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

  transclude?.setAttribute("srcdoc", LoadingPage);

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
        transclude?.setAttribute(
          "srcdoc",
          PageNotFound(address, window.topOrigin),
        );
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
    transclude?.setAttribute("srcdoc", html);

    const currentUrl = new URL(currentAddress, "http://example.com");
    transclude?.setAttribute("hash", currentUrl.hash);
  } catch (e) {
    if (renderVersion !== activeRenderVersion) return;
    outputLensStatus("error");
    transclude?.setAttribute(
      "srcdoc",
      ErrorPage(e instanceof Error ? e.message : String(e)),
    );
  }
});
