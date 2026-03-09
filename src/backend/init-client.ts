import importMap from "./import-map.json";
import { GraffitiRpcClient } from "./graffiti-client";
import { installTransclude } from "./transclude";
import { installEventBridge } from "./events-client";
import { installNavigation } from "./navigation-client";
import { installAutosize } from "./autosize-client";

declare global {
  interface Window {
    graffiti: typeof GraffitiRpcClient;
    Graffiti: typeof GraffitiRpcClient;
    topOrigin: string;
  }
}

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
window.topOrigin = new URL(currentScriptSrc).origin;

if (window.top !== window) {
  // Inject the import map if possible
  // (this can only be done by classic scripts which
  //  can execute before the import map is loaded)
  if (isClassic) {
    const importScript = document.createElement("script");
    importScript.type = "importmap";
    importScript.textContent = JSON.stringify(importMap);
    document.head.append(importScript);
  }

  // Then inject graffiti
  window.graffiti = GraffitiRpcClient; // backwards compatibility
  window.Graffiti = GraffitiRpcClient;

  // Give the page access to transclude,
  // and the ability to navigate
  installTransclude(new window.Graffiti(), window.topOrigin);
  installEventBridge();
  installNavigation(window.topOrigin);
  installAutosize();
} else {
  // If we are the top level window, wrap the content in an iframe
  // and spin up the RPC "server".
  // This allows SocialWiki pages to work as standalone files.
  window.addEventListener("DOMContentLoaded", async () => {
    // Serialize the entire document
    const html = document.documentElement.outerHTML;

    // Clear the current document
    document.documentElement.innerHTML = "";

    // Wait for the "server" to initialize
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${window.topOrigin}/init-server.js`;
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      document.head.append(script);
    });

    // Transclude the document
    const transclude = document.createElement("sw-transclude");
    transclude.style.position = "fixed";
    transclude.style.top = "0";
    transclude.style.left = "0";
    transclude.style.width = "100dvw";
    transclude.style.height = "100dvh";
    transclude.setAttribute("srcdoc", html);
    document.body.appendChild(transclude);
  });
}
