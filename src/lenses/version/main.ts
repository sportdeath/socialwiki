import { initLens, outputLensStatus } from "../../backend/lens-client";
import { ErrorPage, LoadingPage } from "../../backend/status-pages";

const graffiti = new window.graffiti();

let currentAddress = "";
const transclude = document.querySelector("#transclude");
transclude?.setAttribute("srcdoc", LoadingPage);

initLens(async (pageAddress, _lensParams) => {
  const address = pageAddress;
  if (address === currentAddress) return;
  currentAddress = address;
  transclude?.setAttribute("srcdoc", LoadingPage);

  try {
    const media = await graffiti.getMedia(address, {
      types: ["text/html"],
    });
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
