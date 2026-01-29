import importMap from "./import-map.json";
import { GraffitiRpcClient } from "./rpc-client";

declare global {
  interface Window {
    graffiti: typeof GraffitiRpcClient;
  }
}

if (window.top !== window) {
  // If an iframe, inject the import map
  const importScript = document.createElement("script");
  importScript.type = "importmap";
  importScript.textContent = JSON.stringify(importMap);
  document.head.append(importScript);

  // Then inject graffiti
  window.graffiti = GraffitiRpcClient;
} else {
  // If we are the top level window, wrap the content in an iframe
  // and spin up the RPC "server".
  // This allows SocialWiki pages to work as standalone files.
  const currentScriptSrc = (document.currentScript as HTMLScriptElement).src;
  window.addEventListener("DOMContentLoaded", () => {
    // Serialize the entire document
    const html = document.documentElement.outerHTML;

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100dvw";
    iframe.style.height = "100dvh";
    iframe.style.border = "none";
    iframe.srcdoc = html;

    // Clear the current document
    document.documentElement.innerHTML = "";

    // Insert iframe
    document.body.appendChild(iframe);

    // Add the init server script
    const script = document.createElement("script");
    const origin = new URL(currentScriptSrc).origin;
    script.src = `${origin}/init-server.js`;
    document.head.append(script);

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
