import type { EventsParent } from "../events/parent";
import {
  childDocumentRoute,
  type DocumentRouteState,
} from "./document-route";
import {
  dispatchNavigation,
  type NavigableTransclude,
  NAVIGATE_EVENT,
  NAVIGATION_READY_EVENT,
  QUERY_EVENT,
} from "./shared";
import { handleDefaultNavigation } from "./default";

export function installNavigationParent(
  host: NavigableTransclude,
  events: EventsParent,
  documentRoute: DocumentRouteState,
) {
  let query: string | undefined;
  let route: string | undefined;
  let ready = false;

  const sendQuery = () => {
    if (!ready || query === undefined) return;
    const parentRoute = documentRoute.getDocumentRoute();
    const childRoute = parentRoute
      ? childDocumentRoute(parentRoute, route)
      : null;
    events.send(QUERY_EVENT, {
      query,
      ...(childRoute ? { documentRoute: childRoute } : {}),
    });
  };

  const stopRouteUpdates = documentRoute.onDocumentRouteChange(sendQuery);

  const stopListening = events.listen((event) => {
    if (event.type === NAVIGATE_EVENT) {
      const payload = event.detail;
      if (typeof payload !== "object" || payload === null) return;
      const { to } = payload as Record<string, unknown>;
      if (typeof to !== "string") return;

      event.preventDefault();
      dispatchNavigation(to, host, () =>
        handleDefaultNavigation(host, to),
      );
      return;
    }
    if (event.type !== NAVIGATION_READY_EVENT) return;
    event.preventDefault();

    // setQuery may run before the child is ready. Send its latest stored value
    // now and push subsequent changes directly.
    ready = true;
    sendQuery();
  });

  return {
    destroy() {
      stopListening();
      stopRouteUpdates();
    },
    setRoute(nextRoute?: string) {
      route = nextRoute;
      sendQuery();
    },
    setQuery(nextQuery: string) {
      query = nextQuery;
      sendQuery();
    },
  };
}
