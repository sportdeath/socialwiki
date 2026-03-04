export function parseAddress(address: string): {
  name: string;
  hash: string;
} {
  const hashIndex = address.indexOf("#");
  const name = hashIndex < 0 ? address : address.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : address.slice(hashIndex);
  return { name, hash };
}

export function composeAddress(name: string, hash: string): string {
  if (!hash.length) return name;
  return `${name}${hash.startsWith("#") ? hash : `#${hash}`}`;
}

export function parseHash(hash: string): {
  params: URLSearchParams;
  address: string;
} {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;

  if (normalized.startsWith("?")) {
    const [serializedParams = "", address = ""] = normalized
      .slice(1)
      .split(/\/(.*)/);
    return {
      params: new URLSearchParams(serializedParams),
      address,
    };
  }

  return {
    params: new URLSearchParams(),
    address: normalized.replace(/^\//, ""),
  };
}

export function composeHash(
  params: URLSearchParams | undefined,
  address: string,
): string {
  const paramsSerialized = (params ?? "").toString();
  return paramsSerialized.length
    ? `#?${paramsSerialized}/${address}`
    : `#/${address}`;
}
