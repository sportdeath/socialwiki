/**
 * Split an address into the next document name and the query delegated to it.
 * For example, `parseAddress("v?mode=compact/alice")` returns
 * `{ name: "v", query: "?mode=compact/alice" }`.
 *
 * Document names cannot contain `?`: the first `?` is always the delimiter
 * between a document name and its query.
 */
export function parseAddress(address?: string): {
  name: string;
  query: string;
} {
  if (address === undefined) return { name: "", query: "" };
  const queryIndex = address.indexOf("?");
  const name = queryIndex < 0 ? address : address.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : address.slice(queryIndex);
  return { name, query };
}

/**
 * Join a document name to its delegated query, adding `?` when needed.
 * For example, `composeAddress("v", "/alice")` returns `"v?/alice"`.
 * Document names cannot contain `?`, because it is the query delimiter.
 */
export function composeAddress(name: string, query: string): string {
  if (!query.length) return name;
  return `${name}${query.startsWith("?") ? query : `?${query}`}`;
}

/**
 * Split a query into parameters and the address following its first `/`.
 * For `"?mode=compact/alice"`, `params.get("mode")` is `"compact"` and
 * `address` is `"alice"`; `"?/alice"` has empty parameters.
 */
export function parseQuery(query: string): {
  params?: URLSearchParams;
  address?: string;
} {
  if (query.length === 0) return {};
  const normalized = query.startsWith("?") ? query.slice(1) : query;

  // Split at the first slash, if it exists, to separate params from the address.
  const slashIndex = normalized.indexOf("/");
  const serializedParams =
    slashIndex < 0 ? normalized : normalized.slice(0, slashIndex);
  const address = slashIndex < 0 ? undefined : normalized.slice(slashIndex + 1);

  return {
    params: new URLSearchParams(serializedParams),
    address,
  };
}

/**
 * Join parameters and an optional delegated address into a query.
 * Empty parameters plus `"alice"` produce `"?/alice"`; `mode=compact` plus
 * `"alice"` produces `"?mode=compact/alice"`.
 */
export function composeQuery(
  params?: URLSearchParams,
  address?: string,
): string {
  if (address === undefined) return params ? `?${params.toString()}` : "";
  return `?${(params ?? "").toString()}/${address}`;
}
