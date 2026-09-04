import { installTransclude } from "./transclude";
import { installChildBridgeEndpoints } from "./bridges/child";
import { createParentBridgeEndpointInstaller } from "./bridges/parent";
import { ErrorPage } from "./status-pages";

declare const KERNEL_IMPORT_MAP: { imports: Record<string, string> };

const currentScript = document.currentScript;
if (!(currentScript instanceof HTMLScriptElement) || !currentScript.src) {
  throw new Error("The Social.Wiki kernel must be loaded as a classic script");
}
const kernelUrl = new URL(currentScript.src);

if (window.top !== window) {
  // A classic script can inject the import map before later module scripts run.
  const importScript = document.createElement("script");
  importScript.type = "importmap";
  importScript.textContent = JSON.stringify(KERNEL_IMPORT_MAP);
  document.head.append(importScript);

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
    const doctype = document.doctype ? "<!doctype html>" : "";
    const html = doctype + document.documentElement.outerHTML;

    // Replace the document with a clean host. Explicit head/body elements are
    // retained for the script and transclude below.
    document.documentElement.replaceChildren(
      document.createElement("head"),
      document.createElement("body"),
    );

    // Wait for the "server" to initialize
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("./init-server.js", kernelUrl).href;
        script.dataset.baseUrl = baseUrl;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load init-server.js"));
        document.head.append(script);
      });
    } catch (error) {
      document.open();
      document.write(
        ErrorPage(error instanceof Error ? error.message : String(error)),
      );
      document.close();
      return;
    }

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
