import importMap from "./import-map.json";
import { GraffitiSocialWiki } from "./rpc-client";

const importScript = document.createElement("script");
importScript.type = "importmap";
importScript.textContent = JSON.stringify(importMap);
document.head.append(importScript);

declare global {
  interface Window {
    graffiti: typeof GraffitiSocialWiki;
  }
}

window.graffiti = GraffitiSocialWiki;
