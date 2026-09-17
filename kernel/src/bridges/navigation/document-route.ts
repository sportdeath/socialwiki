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
    setDocumentRoute(nextDocumentRoute: DocumentRoute) {
      if (
        documentRoute?.rootUrl === nextDocumentRoute.rootUrl &&
        documentRoute.queryRootUrl === nextDocumentRoute.queryRootUrl &&
        documentRoute.address === nextDocumentRoute.address
      ) {
        return;
      }
      documentRoute = nextDocumentRoute;
      for (const listener of listeners) listener();
    },
  } satisfies DocumentRouteState & {
    setDocumentRoute(documentRoute: DocumentRoute): void;
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

/**
 * Find the absolute route to a child, excluding the query delivered to that
 * child. Transparent documents which receive the same query retain the same
 * route. Other documents consume the prefix of their parent's delegated
 * address which precedes the child's query.
 */
export function childDocumentRoute(
  documentRoute: DocumentRoute,
  parentQuery: string | undefined,
  childQuery: string,
): DocumentRoute | null {
  if (parentQuery === undefined || parentQuery === childQuery) {
    return documentRoute;
  }

  const { params, address } = parseQuery(parentQuery);
  // A side transclusion which is not represented inside the parent's address
  // inherits that complete address as its parent information.
  let routeQuery = parentQuery;
  if (address !== undefined) {
    if (!childQuery) {
      routeQuery = composeQuery(params, address);
    } else if (address.endsWith(childQuery)) {
      routeQuery = composeQuery(
        params,
        address.slice(0, -childQuery.length),
      );
    }
  }

  return queryDocumentRoute(routeQuery, documentRoute);
}
