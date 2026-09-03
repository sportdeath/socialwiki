import type { EventsParent } from "../../events/parent";
import {
  BASE_URL_REQUEST_EVENT,
  BASE_URL_RESPONSE_EVENT,
  QUERY_EVENT,
} from "../shared";

export function installNavigationParent(
  iframe: HTMLIFrameElement,
  events: EventsParent,
  baseUrl: Promise<string>,
) {
  let query: string | undefined;

  const sendQuery = () => {
    if (query === undefined) return;
    events.send(QUERY_EVENT, { query });
  };
  iframe.addEventListener("load", sendQuery);

  const stopListening = events.listen((eventName) => {
    if (eventName !== BASE_URL_REQUEST_EVENT) return;
    // A nested document may ask before this document has received its own
    // base. Waiting on the inherited value keeps one base for the whole tree.
    void baseUrl.then((value) => {
      events.send(BASE_URL_RESPONSE_EVENT, { baseUrl: value });
    });
  });

  return {
    destroy() {
      stopListening();
      iframe.removeEventListener("load", sendQuery);
    },
    setQuery(nextQuery: string) {
      query = nextQuery;
      sendQuery();
    },
  };
}
