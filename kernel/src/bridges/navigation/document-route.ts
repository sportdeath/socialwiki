import { parseQuery } from "../../route";

/** A decoded internal route to a document, excluding that document's query. */
export type DocumentRoute = Readonly<{
  /** The configured target for explicit #/... and #?... routes. */
  rootUrl: string;
  /** The current top-level URL on which query-relative routes are exposed. */
  queryRootUrl?: string;
  /** The decoded root query up to this document, excluding its own query. */
  queryPrefix: string;
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
    typeof route.queryPrefix === "string" &&
    (route.queryPrefix === "" || route.queryPrefix.startsWith("?"))
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
          documentRoute.queryPrefix === nextDocumentRoute.queryPrefix)
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

function rootedRouteQuery(route: string): string | undefined {
  if (route.startsWith("#/")) return `?/${route.slice(2)}`;
  if (route.startsWith("#?")) return route.slice(1);
  return undefined;
}

// Only an address after `/` identifies a child document. Parameters alone are
// state for the current document and cannot prefix the child's relative links.
function hasDelegatedDocument(query: string): boolean {
  return !!parseQuery(query).address;
}

/** Find the route explicitly assigned to a child transclusion. */
export function childDocumentRoute(
  documentRoute: DocumentRoute,
  route: string | undefined,
): DocumentRoute | null {
  // No route attribute makes this an independent side transclusion. Its query
  // is still delivered, but it receives no public route for serializing links.
  if (route === undefined) return null;
  // An explicitly empty route contributes no query and therefore preserves
  // the containing document's route unchanged.
  if (route === "") return documentRoute;
  // A rooted route replaces the containing document's query prefix. It uses
  // rootUrl for relative links rather than inheriting a browser-like
  // document's queryRootUrl.
  const rootedQuery = rootedRouteQuery(route);
  if (rootedQuery !== undefined) {
    // Without a child address, this route refers to the root document itself.
    const queryPrefix = hasDelegatedDocument(rootedQuery) ? rootedQuery : "";
    return { rootUrl: documentRoute.rootUrl, queryPrefix };
  }
  // Relative routes use their canonical query form. Requiring the leading
  // `?` keeps them unambiguous with rooted `#/...` routes and permits a page
  // whose literal name starts with `#/` to be written as `?/#/...`.
  if (!route.startsWith("?")) return null;
  // A query without a child address cannot extend the parent's route.
  if (!hasDelegatedDocument(route)) return documentRoute;

  return { ...documentRoute, queryPrefix: documentRoute.queryPrefix + route };
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
  const rootedQuery = rootedRouteQuery(route);
  if (!isRelativeRoute && rootedQuery === undefined) return null;
  if (!to.startsWith("?")) return to;

  if (rootedQuery !== undefined) {
    if (hasDelegatedDocument(rootedQuery)) return route + to;
    // The child occupies the root document, so its query replaces root state.
    return to.startsWith("?/") ? `#/${to.slice(2)}` : `#${to}`;
  }

  return hasDelegatedDocument(route) ? route + to : to;
}
