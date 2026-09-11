import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";
import { installTransclude } from "./transclude";
import { installChildBridgeEndpoints } from "./bridges/child";
import { DEFAULT_BASE_URL } from "./constants";
import { handleNavigation } from "./bridges/navigation/shared";
import { createParentBridgeEndpointInstaller } from "./bridges/parent";
import { createDefaultResolver } from "./bridges/resolution/default";
import { serializeDocument } from "./bridges/resolution/document";
import {
  handleDocumentResolution,
  resolveDocument,
} from "./bridges/resolution/shared";

declare const KERNEL_IMPORT_MAP: { imports: Record<string, string> };

const currentScript = document.currentScript;
if (!(currentScript instanceof HTMLScriptElement) || !currentScript.src) {
  throw new Error("The Social.Wiki kernel must be loaded as a classic script");
}
const kernelUrl = new URL(currentScript.src);

// For most documents, which do not run at the top level...
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
  // while this document acts as the host for all nested documents
  const initializeHost = () => {
    // Resource URLs follow the original document; navigation follows an
    // explicit browser base or defaults to Social.Wiki.
    const documentUrl = window.location.href;
    const baseUrl =
      document.querySelector<HTMLBaseElement>("base[href]")?.href ?? DEFAULT_BASE_URL;
    const documentTitle = document.title;
    const html = serializeDocument(document, documentUrl);

    // Replace the document with a clean host for the root transclude below.
    document.documentElement.replaceChildren(document.createElement("body"));

    // Install top-level services: Graffiti and resolution
    const graffiti = new GraffitiGuarded();
    handleDocumentResolution(
      createDefaultResolver(kernelUrl.href, baseUrl),
    );

    // Make an installer that allows those services to be
    // bridged to sub-documents.
    const resolve = resolveDocument;
    const bridgedServices = {
      createGraffiti: () => graffiti,
      resolve,
      baseUrl: Promise.resolve(baseUrl),
    };
    const installParentBridgeEndpoints =
      createParentBridgeEndpointInstaller(bridgedServices);

    // Install the <sw-transclude> component for including sub-documents
    installTransclude(resolve, installParentBridgeEndpoints);

    // Handle navigation requests that have bubbled all the way to the top.
    handleNavigation((to) => {
      // Query-only navigation belongs to a containing lens. At the root there
      // is no address left in which to incorporate it.
      if (to.startsWith("?")) return;

      try {
        const url = new URL(to, baseUrl);
        // Ignore non-http/s URLs, e.g. javascript:
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        window.location.href = url.href;
      } catch {
        // Ignore malformed requests
      }
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
      documentTitle || new URL(documentUrl).hostname,
    );
    // Child output must not replace the document this host is wrapping.
    transclude.setAttribute("ignore-lens-output", "");
    transclude.setAttribute("srcdoc", html);

    // Forward any changes to the route to the top-level document
    const syncRoute = () => {
      const hash = window.location.hash;
      const query = hash.startsWith("#/") ? `?/${hash.slice(2)}` : "";
      if (transclude.getAttribute("query") !== query) {
        transclude.setAttribute("query", query);
      }
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    document.body.appendChild(transclude);
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initializeHost, { once: true });
  } else {
    initializeHost();
  }
}
