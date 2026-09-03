import { installTransclude } from "./transclude";
import { installChildBridgeEndpoints } from "./bridges/child";
import { createParentBridgeEndpointInstaller } from "./bridges/parent";
import importMap from "./import-map.json";

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const kernelUrl = new URL(currentScriptSrc);

if (window.top !== window) {
  // TODO: can the import map be updated dynamically based on npm?
  // Inject the import map if possible
  // (this can only be done by classic scripts which
  //  can execute before the import map is loaded)
  if (isClassic) {
    const importScript = document.createElement("script");
    importScript.type = "importmap";
    importScript.textContent = JSON.stringify(importMap);
    document.head.append(importScript);
  }

  // Set up a connection to the parent document for
  // passing Graffiti data, navigation requests,
  // resolutions, and so on
  const bridgedServices = installChildBridgeEndpoints();

  // Initialize an installer that will pass on the
  // connected services to any sub documents
  const installParentBridgeEndpoints =
    createParentBridgeEndpointInstaller(bridgedServices);

  // Initialize the <sw-transclude> component that
  // allows this document to include sub-documents
  const { resolve } = bridgedServices;
  installTransclude(resolve, installParentBridgeEndpoints);
} else {
  // If we are the top-level document, wrap the document in an iframe
  // that will act as a root "server" for all nested documents
  const initializeHost = async () => {
    // Preserve the original document's address as its own resource base.
    const baseUrl = document.baseURI;
    const documentTitle = document.title;
    const html = document.documentElement.outerHTML;

    // Replace the document with a clean host. Explicit head/body elements are
    // retained for the script and transclude below.
    document.documentElement.replaceChildren(
      document.createElement("head"),
      document.createElement("body"),
    );

    // Wait for the "server" to initialize
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./init-server.js", kernelUrl).href;
      script.dataset.baseUrl = baseUrl;
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
    // Keep the kernel-created source stable across reloads.
    transclude.id = "root";
    transclude.setAttribute(
      "name",
      documentTitle || new URL(baseUrl).hostname,
    );
    transclude.setAttribute("srcdoc", html);
    document.body.appendChild(transclude);
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initializeHost, { once: true });
  } else {
    void initializeHost();
  }
}
