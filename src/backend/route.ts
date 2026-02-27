export type ParsedRoute = {
  lens: string;
  lensParams: URLSearchParams;
  pageAddress: string;
};

export function parseRoute(route: string): ParsedRoute {
  const normalized = route.replace(/^#?\//, "");
  const [lensWithParams = "", pageAddress = ""] = normalized.split(/\/(.*)/);
  const [encodedLens = "", lensParams = ""] = lensWithParams.split(/\?(.*)/);
  let lens = encodedLens;
  try {
    lens = decodeURIComponent(encodedLens);
  } catch {
    // Keep invalid percent-encoding as-is to avoid throwing on malformed URLs.
  }
  return {
    lens,
    lensParams: new URLSearchParams(lensParams),
    pageAddress,
  };
}

export function composeRoute({
  lens,
  lensParams,
  pageAddress,
}: ParsedRoute): string {
  const encodedLens = encodeURIComponent(lens);
  const params = lensParams.toString();
  const lensWithParams = params.length ? `${encodedLens}?${params}` : encodedLens;
  return `/${lensWithParams}/${pageAddress}`;
}
