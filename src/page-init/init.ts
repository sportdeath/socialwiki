import type { Graffiti } from "@graffiti-garden/api";
import importMap from "./import-map.json";
import { GraffitiRpcClient } from "./rpc-client";
import { installTransclude } from "./transclude";
import { installNavigation } from "./navigation-client";

declare global {
  interface Window {
    graffiti: typeof GraffitiRpcClient;
  }
}

if (window.top !== window) {
  // If an iframe, ask the "server" for a connection
  window.top?.postMessage("graffiti-init", "*");
  // Destroy that connection on close
  addEventListener("beforeunload", () => {
    window.top?.postMessage("graffiti-destroy", "*");
  });

  // Inject the import map
  const importScript = document.createElement("script");
  importScript.type = "importmap";
  importScript.textContent = JSON.stringify(importMap);
  document.head.append(importScript);

  // Then inject graffiti
  window.graffiti = GraffitiRpcClient;

  installTransclude(new window.graffiti() as unknown as Graffiti);
  installNavigation();
} else {
  // If we are the top level window, wrap the content in an iframe
  // and spin up the RPC "server".
  // This allows SocialWiki pages to work as standalone files.
  const currentScriptSrc = (document.currentScript as HTMLScriptElement).src;
  window.addEventListener("DOMContentLoaded", async () => {
    // Serialize the entire document
    const html = document.documentElement.outerHTML;

    // Clear the current document
    document.documentElement.innerHTML = "";

    // Wait for the "server" to initialize
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const origin = new URL(currentScriptSrc).origin;
      script.src = `${origin}/init-server.js`;
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      document.head.append(script);
    });

    // Transclude the document
    const transclude = document.createElement("social-wiki-transclude");
    transclude.style.position = "fixed";
    transclude.style.top = "0";
    transclude.style.left = "0";
    transclude.style.width = "100dvw";
    transclude.style.height = "100dvh";
    transclude.setAttribute("srcdoc", html);
    document.body.appendChild(transclude);

    // Other defaults
    const metaCharset = document.createElement("meta");
    metaCharset.setAttribute("charset", "utf-8");
    document.head.appendChild(metaCharset);
    const metaViewport = document.createElement("meta");
    metaViewport.name = "viewport";
    metaViewport.content =
      "width=device-width, initial-scale=1, shrink-to-fit=no";
    document.head.appendChild(metaViewport);
  });
}
