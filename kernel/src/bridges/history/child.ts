import type { EventsChild } from "../events/child";
import type { DocumentRouteState } from "../navigation/document-route";
import { HISTORY_TRAVERSE_EVENT } from "./shared";

/** Route-aware history traversal from a sandboxed document. */
export function installHistoryChild(
  events: EventsChild,
  documentRoute: DocumentRouteState,
) {
  const nativeGo = window.history.go.bind(window.history);

  function go(delta = 0) {
    // Match History.go's long conversion. Reloads remain frame-local, while
    // ordinary traversal calls from side transclusions are not forwarded.
    const step = delta | 0;
    if (step === 0) {
      nativeGo(0);
      return;
    }
    if (!documentRoute.getDocumentRoute()) return;
    events.emit(HISTORY_TRAVERSE_EVENT, { delta: step });
  }

  // Chromium blocks a sandboxed iframe from traversing an ancestor's history.
  // Forward routed requests through the bridge, leaving state mutation APIs native.
  Object.defineProperties(window.history, {
    back: { configurable: true, writable: true, value: () => go(-1) },
    forward: { configurable: true, writable: true, value: () => go(1) },
    go: { configurable: true, writable: true, value: go },
  });
}
