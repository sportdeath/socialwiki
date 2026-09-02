import { installTransclude } from "./transclude";
import { installGraffitiChild } from "./bridges/graffiti/child";
import { installEventsChild } from "./bridges/events/child";
import { installAutosizeChild } from "./bridges/autosize/child";
import { installNavigationChild } from "./bridges/navigation/child";
import importMap from "./import-map.json";
import { installLensSourceApi } from "./lens-sources/client";

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
  const graffiti = installGraffitiChild();

  // Enable transclusion
  installTransclude(graffiti);
  installLensSourceApi(kernelUrl.origin);

  // Install message-passing bridges between transcluded frames
  const events = installEventsChild();
  installNavigationChild(events);
  installAutosizeChild(events);
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
