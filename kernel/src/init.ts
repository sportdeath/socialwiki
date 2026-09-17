import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";
import { installTransclude } from "./transclude";
import { installChildBridgeEndpoints } from "./bridges/child";
import { DEFAULT_DOCUMENT_ROUTE } from "./constants";
import { createDocumentRouteState } from "./bridges/navigation/document-route";
import { serializeRouteUrl } from "./bridges/navigation/route-serialization";
import { handleNavigation } from "./bridges/navigation/shared";
import { createParentBridgeEndpointInstaller } from "./bridges/parent";
import { createDefaultResolver } from "./bridges/resolution/default";
import { serializeDocument } from "./bridges/resolution/document";
import {
  handleDocumentResolution,
  resolveDocument,
} from "./bridges/resolution/shared";
import { decodeUrlAddress } from "./url-route";

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
    const documentUrl = window.location.href;
    const documentTitle = document.title;
    const html = serializeDocument(document, documentUrl);

    // Replace the document with a clean host for the root transclude below.
    document.documentElement.replaceChildren(document.createElement("body"));

    // Install top-level services: Graffiti and resolution
    const graffiti = new GraffitiGuarded();
    handleDocumentResolution(createDefaultResolver(kernelUrl.href));
    // Most pages resolve URLs relative to a default route (https://social.wiki),
    // but allow browser-like documents to override this route with their own roots
    const configuredDocumentRoute = currentScript.getAttribute(
      "data-document-route",
    );
    const rootDocumentRoute = new URL(
      configuredDocumentRoute ?? DEFAULT_DOCUMENT_ROUTE,
      documentUrl,
    );
    rootDocumentRoute.hash = "";
    const rootRoute = {
      rootUrl: rootDocumentRoute.href,
      queryRootUrl: documentUrl,
      address: "",
    };
    const documentRoute = createDocumentRouteState(rootRoute);

    // Make an installer that allows those services to be
    // bridged to sub-documents.
    const bridgedServices = {
      createGraffiti: () => graffiti,
      resolve: resolveDocument,
      documentRoute,
    };
    const installParentBridgeEndpoints =
      createParentBridgeEndpointInstaller(bridgedServices);

    // Install the <sw-transclude> component for including sub-documents
    installTransclude(resolveDocument, installParentBridgeEndpoints);

    // Handle navigation requests that have bubbled all the way to the top.
    handleNavigation((to) => {
      try {
        const url =
          serializeRouteUrl(to, rootRoute) ?? new URL(to, rootDocumentRoute);
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
    // The root frame is the origin's own document, not a separate permission
    // principal beneath it.
    transclude.setAttribute("permission-scope", "inherit");
    transclude.setAttribute(
      "name",
      documentTitle || new URL(documentUrl).hostname,
    );
    transclude.setAttribute("srcdoc", html);

    // Forward any changes to the route to the top-level document
    const syncRoute = () => {
      const hash = window.location.hash;
      const query = hash.startsWith("#/")
        ? `?/${decodeUrlAddress(hash.slice(2))}`
        : "";
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
