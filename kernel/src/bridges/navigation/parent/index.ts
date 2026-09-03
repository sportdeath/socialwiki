import type { EventsParent } from "../../events/parent";
import {
  BASE_URL_RESPONSE_EVENT,
  NAVIGATION_READY_EVENT,
  QUERY_EVENT,
} from "../shared";

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

  const stopListening = events.listen((eventName) => {
    if (eventName !== NAVIGATION_READY_EVENT) return;

    // setQuery may run before the child is ready. Send its latest stored value
    // now and push subsequent changes directly.
    ready = true;
    sendQuery();

    // A nested document may become ready before this document has received its
    // own base. Waiting keeps one stable inherited base for the whole tree.
    void baseUrl.then((value) => {
      events.send(BASE_URL_RESPONSE_EVENT, { baseUrl: value });
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
