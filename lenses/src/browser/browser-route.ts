const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;

// Navigation may arrive in any of the hash forms emitted by a nested document
// or reconstructed against its inherited base URL.
export function extractHashRoute(source: string, baseUrl: string) {
  if (source.startsWith("#/")) return source.slice(2);
  if (source.startsWith("/#/")) return source.slice(3);
  const url = new URL(source, baseUrl);
  const base = new URL(baseUrl);
  if (
    url.origin === base.origin &&
    url.pathname === base.pathname &&
    url.search === base.search &&
    url.hash.startsWith("#/")
  ) {
    return url.hash.slice(2);
  }
  return null;
}

export function getLegacyLensRedirect(address: string) {
  // Older links put the lens outside Social.Wiki's nested query structure.
  for (const lens of ["v", "h", "e"]) {
    const slashPrefix = `${lens}/`;
    if (address.startsWith(slashPrefix)) {
      return composeAddress(
        lens,
        composeQuery(undefined, address.slice(slashPrefix.length)),
      );
    }

    const hashPrefix = `${lens}#/`;
    if (address.startsWith(hashPrefix)) {
      return composeAddress(
        lens,
        composeQuery(undefined, address.slice(hashPrefix.length)),
      );
    }
  }

  return null;
}

function safeDecodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeAddress(address: string): string {
  // Each query may contain another complete Social.Wiki address, so decoding
  // must follow the route structure instead of decoding the whole string.
  const { name, query } = parseAddress(address);
  const decodedName = safeDecodeComponent(name);
  if (!query.length) return composeAddress(decodedName, query);

  const { params, address: nestedAddress } = parseQuery(query);
  return composeAddress(
    decodedName,
    composeQuery(
      params,
      nestedAddress === undefined ? undefined : decodeAddress(nestedAddress),
    ),
  );
}

function encodeName(name: string): string {
  // Keep path separators readable in names while encoding other reserved chars.
  return encodeURIComponent(name).replace(/%2F/gi, "/");
}

function encodeAddress(address?: string): string {
  if (address === undefined) return "";

  const { name, query } = parseAddress(address);
  const encodedName = encodeName(name);
  if (!query.length) return composeAddress(encodedName, query);

  const { params, address: nestedAddress } = parseQuery(query);
  return composeAddress(
    encodedName,
    composeQuery(
      params,
      nestedAddress === undefined ? undefined : encodeAddress(nestedAddress),
    ),
  );
}

export function encodeRouteForRouter(address?: string): string {
  return `/${encodeAddress(address)}`;
}
