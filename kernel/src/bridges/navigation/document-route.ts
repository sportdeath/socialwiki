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

function normalizeChildRoute(route: string) {
  return route.startsWith("?") ? route : composeQuery(undefined, route);
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

  return queryDocumentRoute(normalizeChildRoute(route), documentRoute);
}

/**
 * Apply a routed transclusion's public route to navigation from its child.
 * `null` means the transclusion has no route and retains its local fallback.
 */
export function resolveChildNavigation(
  route: string | undefined,
  to: string,
): string | null {
  if (route === undefined) return null;
  if (!to.startsWith("?") || route === "") return to;

  const { params, address } = parseQuery(normalizeChildRoute(route));
  if (address === undefined) return null;
  return composeQuery(params, composeAddress(address, to));
}
