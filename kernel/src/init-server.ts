import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";
import { installBrowserResolverHost } from "./browser-resolver/host";
import { installEventsParent } from "./bridges/events/parent";
import { installNavigationParent } from "./bridges/navigation/parent";
import { installLensSourceHost } from "./lens-sources/host";
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

installNavigationParent(undefined, installEventsParent(), (to) => {
  // Query-only navigation belongs to the parent of the specific transclude.
  // This root handles navigation that has propagated out of that frame.
  if (to.startsWith("?")) return;

  const url = new URL(to, navigationBaseUrl);
  if (url.hash.startsWith("#/")) {
    window.location.hash = url.hash;
    return;
  }

  window.location.href = url.href;
});
