export function parsePageAddress(pageAddress: string): {
  name: string;
  hash: string;
} {
  const hashIndex = pageAddress.indexOf("#");
  const name = hashIndex < 0 ? pageAddress : pageAddress.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : pageAddress.slice(hashIndex);
  return { name, hash };
}

export function composePageAddress(name: string, hash: string): string {
  if (!hash.length) return name;
  return `${name}${hash.startsWith("#") ? hash : `#${hash}`}`;
}

export function parseLensHash(hash: string): {
  lensParams: URLSearchParams;
  pageAddress: string;
} {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;

  if (normalized.startsWith("?")) {
    const [serializedParams = "", pageAddress = ""] = normalized
      .slice(1)
      .split(/\/(.*)/);
    return {
      lensParams: new URLSearchParams(serializedParams),
      pageAddress,
    };
  }

  return {
    lensParams: new URLSearchParams(),
    pageAddress: normalized.replace(/^\//, ""),
  };
}

export function composeLensHash(
  lensParams: URLSearchParams | undefined,
  pageAddress: string,
): string {
  const params = (lensParams ?? "").toString();
  return params.length ? `#?${params}/${pageAddress}` : `#/${pageAddress}`;
}

export function composeLensAddress(
  lens: string,
  lensParams: URLSearchParams | undefined,
  pageAddress: string,
): string {
  return composePageAddress(lens, composeLensHash(lensParams, pageAddress));
}
