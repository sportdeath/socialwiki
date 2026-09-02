import { installAutosize } from "./bridges/autosize/client";
import { installEventBridge } from "./bridges/events/client";
import { SocialWikiGraffiti } from "./bridges/graffiti/client";
import { installLensSourceApi } from "./bridges/lens-sources/client";
import { installNavigation } from "./bridges/navigation/client";
import importMap from "./import-map.json";
import { installTransclude } from "./transclude";

declare global {
  interface Window {
    Graffiti: typeof SocialWikiGraffiti;
  }
}

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const kernelUrl = new URL(currentScriptSrc);

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

  // Each nested frame receives Graffiti from its immediate parent.
  window.Graffiti = SocialWikiGraffiti;
  const graffiti = new window.Graffiti();

  // Enable transclusion
  installTransclude(graffiti);
  installLensSourceApi(kernelUrl.origin);

  // Install message-passing bridges between transcluded frames
  installEventBridge();
  installNavigation();
  installAutosize();
} else {
  // If we are the top level window, wrap the content in an iframe
  // and spin up the RPC "server".
  window.addEventListener("DOMContentLoaded", async () => {
    // Preserve the original document's address as its own resource base.
    const navigationBaseUrl = document.baseURI;
    const html = document.documentElement.outerHTML;

    // Replace the document with a clean host. Explicit head/body elements are
    // needed because the server installs the guard and transclude immediately.
    document.documentElement.replaceChildren(
      document.createElement("head"),
      document.createElement("body"),
    );

    // Wait for the "server" to initialize
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./init-server.js", kernelUrl).href;
      script.dataset.navigationBaseUrl = navigationBaseUrl;
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      document.head.append(script);
    });

    // Transclude the serialized document
    const transclude = document.createElement("sw-transclude");
    transclude.style.position = "fixed";
    transclude.style.top = "0";
    transclude.style.left = "0";
    transclude.style.width = "100dvw";
    transclude.style.height = "100dvh";
    transclude.setAttribute("srcdoc", html);
    document.body.appendChild(transclude);
  }, { once: true });
}
