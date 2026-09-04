import type { EventsChild } from "../events/child";
import {
  RESOLUTION_REQUEST_EVENT,
  RESOLUTION_RESPONSE_EVENT,
  handleDocumentResolution,
  isResolvedDocument,
  resolveDocument,
  type DocumentResolver,
} from "./shared";

let nextRequestId = 0;

/** Use the immediate parent as this document's default resolver. */
export function installResolutionChild(events: EventsChild): DocumentResolver {
  const resolveThroughParent: DocumentResolver = (src, signal) => {
    // Responses may arrive out of order when several transcludes resolve at
    // once, so each invocation listens only for its own request ID.
    const requestId = String(nextRequestId++);

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        stopListening();
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        // The event bridge has no cancellation message. Stop waiting locally;
        // a late response will simply have no matching listener.
        cleanup();
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const stopListening = events.listen(
        RESOLUTION_RESPONSE_EVENT,
        (payload) => {
          if (typeof payload !== "object" || payload === null) return;
          const response = payload as Record<string, unknown>;
          if (response.requestId !== requestId) return;

          cleanup();
          if (typeof response.error === "string") {
            reject(new Error(response.error));
          } else if (isResolvedDocument(response.document)) {
            resolve(response.document);
          } else {
            reject(new Error("Resolver returned an invalid document"));
          }
        },
      );

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) return onAbort();
      events.emit(RESOLUTION_REQUEST_EVENT, { requestId, src });
    });
  };

  handleDocumentResolution(resolveThroughParent);
  return resolveDocument;
}
