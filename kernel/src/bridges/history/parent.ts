import type { EventsParent } from "../events/parent";
import {
  childDocumentRoute,
  type DocumentRouteState,
} from "../navigation/document-route";
import type { NavigableTransclude } from "../navigation/shared";
import { HISTORY_TRAVERSE_EVENT } from "./shared";

/** Forward only routed bridge requests to the tab's History object. */
export function installHistoryParent(
  host: NavigableTransclude,
  events: EventsParent,
  documentRoute: DocumentRouteState,
) {
  return events.listen((event) => {
    if (event.type !== HISTORY_TRAVERSE_EVENT) return;
    event.preventDefault();

    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const delta = (payload as Record<string, unknown>).delta;
    if (typeof delta !== "number" || delta === 0 || (delta | 0) !== delta) return;

    const route = documentRoute.getDocumentRoute();
    const childRoute = host.getAttribute("route") ?? undefined;
    if (!route || !childDocumentRoute(route, childRoute)) return;
    window.history.go(delta);
  });
}
