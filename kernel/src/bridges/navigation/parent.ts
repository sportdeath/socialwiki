import type { EventsParent } from "../events/parent";
import {
  BASE_URL_RESPONSE_EVENT,
  NAVIGATION_READY_EVENT,
  QUERY_EVENT,
} from "./shared";

export function installNavigationParent(
  events: EventsParent,
  baseUrl: Promise<string>,
) {
  let query: string | undefined;
  let ready = false;

  const sendQuery = () => {
    if (!ready || query === undefined) return;
    events.send(QUERY_EVENT, { query });
  };

  const stopListening = events.listen((event) => {
    if (event.type !== NAVIGATION_READY_EVENT) return;
    event.preventDefault();

    // A nested document may become ready before this document has received its
    // own base. Wait before providing that context to its descendants.
    void baseUrl.then((value) => {
      // Query observers may resolve links, so establish their base first.
      events.send(BASE_URL_RESPONSE_EVENT, { baseUrl: value });
      // setQuery may run before the child is ready. Send its latest stored value
      // now and push subsequent changes directly.
      ready = true;
      sendQuery();
    });
  });

  return {
    destroy() {
      stopListening();
    },
    setQuery(nextQuery: string) {
      query = nextQuery;
      sendQuery();
    },
  };
}
