export function parseAddress(address: string): {
  name: string;
  fragment: string;
} {
  const fragmentIndex = address.indexOf("#");
  const name = fragmentIndex < 0 ? address : address.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? "" : address.slice(fragmentIndex);
  return { name, fragment };
}

export function composeAddress(name: string, fragment: string): string {
  if (!fragment.length) return name;
  return `${name}${fragment.startsWith("#") ? fragment : `#${fragment}`}`;
}

export function parseFragment(fragment: string): {
  params: URLSearchParams;
  address: string;
} {
  const normalized = fragment.startsWith("#") ? fragment.slice(1) : fragment;

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

export function composeFragment(
  params: URLSearchParams | undefined,
  address: string,
): string {
  const paramsSerialized = (params ?? "").toString();
  return paramsSerialized.length
    ? `#?${paramsSerialized}/${address}`
    : `#/${address}`;
}
