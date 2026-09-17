import { encodeUrlAddress } from "../../url-route";
import {
  queryDocumentRoute,
  type DocumentRoute,
} from "./document-route";

/** Serialize a decoded document route for the browser. */
function documentRouteUrl(documentRoute: DocumentRoute): URL | null {
  const url = new URL(documentRoute.rootUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = `#/${encodeUrlAddress(documentRoute.address)}`;
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
  if (to.startsWith("?")) {
    const route = queryDocumentRoute(to, documentRoute);
    return route ? documentRouteUrl(route) : null;
  }

  // Read the authored hash directly: URL would preserve valid percent escapes,
  // but percent signs in Social.Wiki names are literal until this boundary.
  const hashIndex = to.indexOf("#");
  const hash = hashIndex < 0 ? "" : to.slice(hashIndex);
  if (!hash.startsWith("#/")) return null;

  const url = new URL(to, documentRoute.rootUrl);
  const root = new URL(documentRoute.rootUrl);
  if (
    url.origin !== root.origin ||
    url.pathname !== root.pathname ||
    url.search !== root.search
  ) {
    return null;
  }

  return documentRouteUrl({
    rootUrl: documentRoute.rootUrl,
    address: hash.slice(2),
  });
}
