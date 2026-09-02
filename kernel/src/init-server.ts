import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";
import { installBrowserResolverHost } from "./bridges/browser-resolver/host";
import { installLensSourceHost } from "./bridges/lens-sources/host";
import { serveNavigation } from "./bridges/navigation/host";
import {
  createDefaultBrowserResolver,
  installTransclude,
} from "./transclude";

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const kernelUrl = new URL(currentScriptSrc);
const navigationBaseUrl = isClassic
  ? (document.currentScript as HTMLScriptElement).dataset.navigationBaseUrl ??
    window.location.href
  : window.location.href;

// Initialize Graffiti
const graffiti = new GraffitiGuarded();

// Install top-level services
installLensSourceHost(kernelUrl.origin);
installBrowserResolverHost(createDefaultBrowserResolver(kernelUrl.origin));
installTransclude(graffiti);

serveNavigation((to) => {
  // Query-only navigation belongs to the host for the specific transclude.
  // This root host handles navigation that has propagated out of that frame.
  if (to.startsWith("?")) return;

  const url = new URL(to, navigationBaseUrl);
  if (url.hash.startsWith("#/")) {
    window.location.hash = url.hash;
    return;
  }

  window.location.href = url.href;
});
