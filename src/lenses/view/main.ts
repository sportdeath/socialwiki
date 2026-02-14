import { initLens, outputLensStatus } from "../../backend/lens-client";
import { getPageVersions } from "../../backend/page-versions";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../../backend/status-pages";

const graffiti = new window.graffiti();

let currentAddress = "";
let currentPageName = "";
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

initLens(async (pageAddress, _lensParams) => {
  const address = pageAddress;
  if (address === currentAddress) return;
  currentAddress = address;

  const url = new URL(address, "http://example.com");
  const pageName = url.pathname.slice(1);
  if (pageName === currentPageName) {
    // If the page name hasn't changed, we can just update the hash
    transclude?.setAttribute("hash", url.hash);
    return;
  }
  currentPageName = pageName;

  transclude?.setAttribute("srcdoc", LoadingPage);

  try {
    const pageVersions = await getPageVersions(graffiti, pageName);
    if (pageName !== currentPageName) return;

    const potentialPageVersion = pageVersions.at(0);
    if (!potentialPageVersion) {
      outputLensStatus("not-found");
      transclude?.setAttribute(
        "srcdoc",
        PageNotFound(address, window.topOrigin),
      );
      return;
    }

    const media = await graffiti.getMedia(
      potentialPageVersion.value.result.media,
      {
        types: ["text/html"],
      },
    );
    if (pageName !== currentPageName) return;

    const html = await media.data.text();
    if (pageName !== currentPageName) return;

    outputLensStatus("ok", html);
    transclude?.setAttribute("srcdoc", html);

    if (address === currentAddress) {
      transclude?.setAttribute("hash", url.hash);
    }
  } catch (e) {
    outputLensStatus("error");
    transclude?.setAttribute(
      "srcdoc",
      ErrorPage(e instanceof Error ? e.message : String(e)),
    );
  }
});
