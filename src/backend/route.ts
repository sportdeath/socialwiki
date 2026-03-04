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
  const decodeAddress = (value: string): string => {
    // Browser/router fragment URLs may percent-encode unicode. Decode once
    // when reading route state so UI-facing page addresses stay human-readable.
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  };

  const normalized = fragment.startsWith("#") ? fragment.slice(1) : fragment;

  if (normalized.startsWith("?")) {
    const [serializedParams = "", address = ""] = normalized
      .slice(1)
      .split(/\/(.*)/);
    return {
      params: new URLSearchParams(serializedParams),
      address: decodeAddress(address),
    };
  }

  return {
    params: new URLSearchParams(),
    address: decodeAddress(normalized.replace(/^\//, "")),
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
