import type { Graffiti } from "@graffiti-garden/api";
import { defineTranscludeElement } from "./element";

export { createDefaultBrowserResolver } from "./default-resolver";

export function installTransclude(graffiti: Graffiti) {
  if (customElements.get("sw-transclude")) return;
  defineTranscludeElement(graffiti);
}
