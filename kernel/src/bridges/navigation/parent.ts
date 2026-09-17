import type { EventsParent } from "../events/parent";
import {
  childDocumentRoute,
  type DocumentRouteState,
} from "./document-route";
import {
  NAVIGATION_READY_EVENT,
  QUERY_EVENT,
} from "./shared";

export function installNavigationParent(
  events: EventsParent,
  documentRoute: DocumentRouteState,
) {
  let query: string | undefined;
  let ready = false;

  const sendQuery = () => {
    if (!ready || query === undefined) return;
    const parentRoute = documentRoute.getDocumentRoute();
    if (!parentRoute) return;
    const parentQuery =
      typeof window.query === "string" ? window.query : undefined;
    const childRoute = childDocumentRoute(parentRoute, parentQuery, query);
    if (!childRoute) return;
    events.send(QUERY_EVENT, {
      query,
      documentRoute: childRoute,
    });
  };

  const stopRouteUpdates = documentRoute.onDocumentRouteChange(sendQuery);

  const stopListening = events.listen((event) => {
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
    setQuery(nextQuery: string) {
      query = nextQuery;
      sendQuery();
    },
  };
}
