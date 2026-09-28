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

/** The empty-parameter root query `?/...` has the shorter URL form `#/...`. */
export function encodeUrlQuery(query: string): string {
  const encoded = encodeUrlAddress(query);
  return encoded.startsWith("?/") ? `#/${encoded.slice(2)}` : `#${encoded}`;
}

/** Decode only Social.Wiki URL routes; other hashes remain native fragments. */
export function decodeUrlQuery(hash: string): string | undefined {
  if (hash.startsWith("#/")) return `?/${decodeUrlAddress(hash.slice(2))}`;
  if (hash.startsWith("#?")) return decodeUrlAddress(hash.slice(1));
  return undefined;
}
