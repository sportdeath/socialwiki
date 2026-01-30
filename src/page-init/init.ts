import type { Graffiti } from "@graffiti-garden/api";
import importMap from "./import-map.json";
import { GraffitiRpcClient } from "./rpc-client";
import { installTransclude } from "./transclude";

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

    // Put the document in an iframe "client"
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100dvw";
    iframe.style.height = "100dvh";
    iframe.style.border = "none";
    iframe.srcdoc = html;
    iframe.sandbox =
      "allow-scripts allow-forms allow-modals allow-pointer-lock";

    // Insert iframe
    document.body.appendChild(iframe);

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
