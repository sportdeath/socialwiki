import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";
import { createDefaultResolver } from "./bridges/resolution/default";
import { installDocumentResolver } from "./bridges/resolution/shared";
import { createParentBridgeEndpointInstaller } from "./bridges/parent";
import { installTransclude } from "./transclude";
import { handleNavigation } from "./bridges/navigation/parent";

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const kernelUrl = new URL(currentScriptSrc);
const navigationBaseUrl = isClassic
  ? (document.currentScript as HTMLScriptElement).dataset.navigationBaseUrl ??
    window.location.href
  : window.location.href;

// Install top-level services: Graffiti and resolution
const graffiti = new GraffitiGuarded();
const resolve = installDocumentResolver(
  createDefaultResolver(kernelUrl.origin, navigationBaseUrl),
);

// Make an installer that allows those services to be
// bridged to sub-documents.
const bridgedServices = { graffiti, resolve };
const installParentBridgeEndpoints = createParentBridgeEndpointInstaller(bridgedServices);

// Install the <sw-transclude> component for including sub-documents
installTransclude(
  resolve,
  installParentBridgeEndpoints
);

// Handle navigation requests that have bubbled all the way to the top
handleNavigation(window, (to) => {
  // Query-only navigation belongs to a containing lens. At the root there is
  // no address left in which to incorporate it.
  if (to.startsWith("?")) return;

  try {
    const url = new URL(to, navigationBaseUrl);
    // Ignore non-http/s URLs, e.g. javascript:
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    window.location.href = url.href;
  } catch {
    // Ignore malformed requests
  }
});
