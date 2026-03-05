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

export function composeAddress(name: string, query: string): string {
  if (!query.length) return name;
  return `${name}${query.startsWith("?") ? query : `?${query}`}`;
}

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

export function composeQuery(
  params?: URLSearchParams,
  address?: string,
): string {
  if (address === undefined) return params ? `?${params.toString()}` : "";
  return `?${(params ?? "").toString()}/${address}`;
}
