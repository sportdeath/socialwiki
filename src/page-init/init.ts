import importMap from "./import-map.json";
import { GraffitiRpcClient } from "./rpc-client";

const importScript = document.createElement("script");
importScript.type = "importmap";
importScript.textContent = JSON.stringify(importMap);
document.head.append(importScript);

declare global {
  interface Window {
    graffiti: typeof GraffitiRpcClient;
  }
}

if (window.top !== window) {
  window.graffiti = GraffitiRpcClient;
} else {
  // If we are the top level window, wrap the content in an iframe
  // and spin up the RPC "server".
  // This allows SocialWiki pages to work as standalone files.
  window.addEventListener("DOMContentLoaded", () => {
    // Serialize the entire document
    const html = document.documentElement.outerHTML;

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.srcdoc = html;

    // Clear the current document
    document.documentElement.innerHTML = "";

    // Insert iframe
    document.body.appendChild(iframe);

    // Add the init server script
    const script = document.createElement("script");
    script.src = "http://localhost:5173/init-server.js";
    document.head.append(script);
  });
}
