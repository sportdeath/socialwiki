import { composeAddress, composeQuery, parseQuery } from "../../route";

/** A decoded internal route to a document, excluding that document's query. */
export type DocumentRoute = Readonly<{
  /** The configured target for explicit #/... routes. */
  rootUrl: string;
  /** The current top-level URL on which query-relative routes are exposed. */
  queryRootUrl?: string;
  /** The decoded Social.Wiki address from that root to this document. */
  address: string;
}>;

export type DocumentRouteState = {
  getDocumentRoute(): DocumentRoute | undefined;
  onDocumentRouteChange(listener: () => void): () => void;
};

export function isDocumentRoute(value: unknown): value is DocumentRoute {
  if (typeof value !== "object" || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route.rootUrl === "string" &&
    (route.queryRootUrl === undefined ||
      typeof route.queryRootUrl === "string") &&
    typeof route.address === "string"
  );
}

export function createDocumentRouteState(initialDocumentRoute?: DocumentRoute) {
  let documentRoute = initialDocumentRoute;
  const listeners = new Set<() => void>();

  return {
    getDocumentRoute: () => documentRoute,
    onDocumentRouteChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setDocumentRoute(nextDocumentRoute?: DocumentRoute) {
      if (
        documentRoute === nextDocumentRoute ||
        (documentRoute !== undefined &&
          nextDocumentRoute !== undefined &&
          documentRoute.rootUrl === nextDocumentRoute.rootUrl &&
          documentRoute.queryRootUrl === nextDocumentRoute.queryRootUrl &&
          documentRoute.address === nextDocumentRoute.address)
      ) {
        return;
      }
      documentRoute = nextDocumentRoute;
      for (const listener of listeners) listener();
    },
  } satisfies DocumentRouteState & {
    setDocumentRoute(documentRoute?: DocumentRoute): void;
  };
}

/** Attach a query to the decoded route identifying its document. */
export function queryDocumentRoute(
  query: string,
  documentRoute: DocumentRoute,
): DocumentRoute | null {
  if (!query.startsWith("?")) return null;

  const nextAddress = documentRoute.address
    ? composeAddress(documentRoute.address, query)
    : parseQuery(query).address;

  if (nextAddress === undefined) return null;
  return { ...documentRoute, address: nextAddress };
}

/** Find the route explicitly assigned to a child transclusion. */
export function childDocumentRoute(
  documentRoute: DocumentRoute,
  route: string | undefined,
): DocumentRoute | null {
  // No route attribute makes this an independent side transclusion. Its query
  // is still delivered, but it receives no public route for serializing links.
  if (route === undefined) return null;
  // An explicitly empty route contributes no address and therefore preserves
  // the containing document's route unchanged.
  if (route === "") return documentRoute;
  // A rooted route replaces the containing document's address. It also uses
  // rootUrl for relative links rather than inheriting a browser-like
  // document's queryRootUrl.
  if (route.startsWith("#/")) {
    return { rootUrl: documentRoute.rootUrl, address: route.slice(2) };
  }
  // Relative routes use their canonical query form. Requiring the leading
  // `?` keeps them unambiguous with rooted `#/...` routes and permits a page
  // whose literal name starts with `#/` to be written as `?/#/...`.
  if (!route.startsWith("?")) return null;

  return queryDocumentRoute(route, documentRoute);
}

/**
 * Apply a routed transclusion's public route to navigation from its child.
 * `null` means the supplied route is not valid.
 */
export function resolveChildNavigation(
  route: string,
  to: string,
): string | null {
  if (route === "") return to;

  const isRelativeRoute = route.startsWith("?");
  const isRootRoute = route.startsWith("#/");
  if (!isRelativeRoute && !isRootRoute) return null;
  if (!to.startsWith("?")) return to;

  if (isRootRoute) {
    const nextRoute = queryDocumentRoute(to, {
      rootUrl: "",
      address: route.slice(2),
    });
    return nextRoute ? `#/${nextRoute.address}` : null;
  }

  const { params, address } = parseQuery(route);
  if (address === undefined) return null;
  return composeQuery(params, composeAddress(address, to));
}
