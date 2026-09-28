import { encodeUrlQuery } from "../../url-route";
import type { DocumentRoute } from "./document-route";

/** Serialize a complete decoded root query for the browser. */
function documentRouteUrl(query: string, rootUrl: string): URL | null {
  const url = new URL(rootUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = encodeUrlQuery(query);
  return url;
}

/**
 * Convert an internal navigation destination to a browser URL. Returns null
 * for ordinary web URLs, which should retain native URL resolution.
 */
export function serializeRouteUrl(
  to: string,
  documentRoute: DocumentRoute,
): URL | null {
  // If the route is relative, i.e. it begins with a "?",
  // make sure that it stays on the current document (queryRootUrl) rather
  // than inheriting the default base (rootUrl)
  if (to.startsWith("?")) {
    return documentRouteUrl(
      documentRoute.queryPrefix + to,
      documentRoute.queryRootUrl ?? documentRoute.rootUrl,
    );
  }

  // Only hash links authored within a document are raw Social.Wiki routes.
  // Complete web URLs, including copied Social.Wiki links, are already encoded.
  if (!to.startsWith("#/") && !to.startsWith("#?")) return null;
  const query = to.startsWith("#/") ? `?/${to.slice(2)}` : to.slice(1);
  return documentRouteUrl(query, documentRoute.rootUrl);
}
