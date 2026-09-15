import {
  composeAddress,
  composeQuery,
  parseAddress,
  parseQuery,
} from "./route";

function safeDecodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Convert a URL-serialized address into the representation used by lenses. */
export function decodeUrlAddress(address: string): string {
  const { name, query } = parseAddress(address);
  const decodedName = safeDecodeComponent(name);
  if (!query.length) return composeAddress(decodedName, query);

  const { params, address: nestedAddress } = parseQuery(query);
  return composeAddress(
    decodedName,
    composeQuery(
      params,
      nestedAddress === undefined
        ? undefined
        : decodeUrlAddress(nestedAddress),
    ),
  );
}

function encodeName(name: string): string {
  // Slashes are readable and unambiguous within a document-name segment.
  return encodeURIComponent(name).replace(/%2F/gi, "/");
}

/** Convert a lens address into the representation used by a URL hash. */
export function encodeUrlAddress(address?: string): string {
  if (address === undefined) return "";

  const { name, query } = parseAddress(address);
  const encodedName = encodeName(name);
  if (!query.length) return composeAddress(encodedName, query);

  const { params, address: nestedAddress } = parseQuery(query);
  return composeAddress(
    encodedName,
    composeQuery(
      params,
      nestedAddress === undefined
        ? undefined
        : encodeUrlAddress(nestedAddress),
    ),
  );
}

/**
 * Resolve a URL authored inside a document without serializing its route.
 * `URL` is still used for normal URL resolution, but `address` comes from the
 * original string so decoded names and literal percent signs remain intact.
 */
export function resolveAuthoredRoute(
  to: string,
  baseUrl: string | URL,
): { url: URL; address: string } | null {
  const hashIndex = to.indexOf("#");
  const hash = hashIndex < 0 ? "" : to.slice(hashIndex);
  const url = new URL(to, baseUrl);
  if (!hash.startsWith("#/")) return null;
  return { url, address: hash.slice(2) };
}

/**
 * Resolve and encode a Social.Wiki hash URL authored inside a document. The
 * hash is a lens address, not an already URL-serialized value. Returns null for
 * URLs that do not address the current site's route, so external links remain
 * untouched.
 */
export function canonicalRouteUrl(
  to: string,
  baseUrl: string | URL,
): URL | null {
  const route = resolveAuthoredRoute(to, baseUrl);
  if (!route) return null;

  const { url, address } = route;
  const base = new URL(baseUrl);
  if (
    url.origin !== base.origin ||
    url.pathname !== base.pathname ||
    url.search !== base.search
  ) {
    return null;
  }

  url.hash = `#/${encodeUrlAddress(address)}`;
  return url;
}
