const { composeAddress, composeQuery } = window.route;

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

/** Navigate to a decoded Social.Wiki address through the kernel bridge. */
export function navigateAddress(address: string) {
  window.navigate(routeHref(address));
}

/** Build a URL for an ordinary link handled by the navigation bridge. */
export function routeHref(address: string) {
  return `#/${address}`;
}
