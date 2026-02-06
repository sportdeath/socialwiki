import type { Graffiti } from "@graffiti-garden/api";
import { initLens, outputLensStatus } from "../../backend/lens-client";
import { getPageVersions } from "../../backend/page-versions";
import {
  ErrorPage,
  LoadingPage,
  PageNotFound,
} from "../../backend/status-pages";

const graffiti = new window.graffiti();

let currentAddress = "";
const transclude = document.querySelector("#transclude") as HTMLElement;
transclude.setAttribute("srcdoc", LoadingPage);

// Watch the transclude src attribute.
// If it changes, forward the navigation to the parent
const observer = new MutationObserver(() => {
  const to = transclude.getAttribute("src");
  if (to) window.navigate(to);
});
observer.observe(transclude, {
  attributes: true,
  attributeFilter: ["src"],
});

initLens(async (address: string) => {
  // TODO: select out the page name from the address
  if (address === currentAddress) return;
  currentAddress = address;
  transclude?.setAttribute("srcdoc", LoadingPage);

  try {
    const pageVersions = await getPageVersions(graffiti, address);
    if (currentAddress !== address) return;

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
    if (currentAddress !== address) return;

    const html = await media.data.text();
    if (currentAddress !== address) return;

    outputLensStatus("ok", html);
    transclude?.setAttribute("srcdoc", html);
  } catch (e) {
    outputLensStatus("error");
    transclude?.setAttribute(
      "srcdoc",
      ErrorPage(e instanceof Error ? e.message : String(e)),
    );
  }
});
