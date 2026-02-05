import type { Graffiti } from "@graffiti-garden/api";
import { initLens, outputLensStatus } from "../../backend/lens-client";
import { getPageVersions } from "../../backend/page-versions";

const graffiti = new window.graffiti() as unknown as Graffiti;

let currentAddress = "";
const transclude = document.querySelector("#transclude");
transclude?.setAttribute("srcdoc", "Loading");

initLens(async (address: string) => {
  if (address === currentAddress) return;
  currentAddress = address;
  transclude?.setAttribute("srcdoc", "Loading");

  try {
    const pageVersions = await getPageVersions(graffiti, address);
    if (currentAddress !== address) return;

    const potentialPageVersion = pageVersions.at(0);
    if (!potentialPageVersion) {
      outputLensStatus("not-found");
      transclude?.setAttribute("srcdoc", "Not found");
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
      `Error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
});
