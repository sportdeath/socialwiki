import type { EventsParent } from "../events/parent";
import {
  RESOLUTION_REQUEST_EVENT,
  RESOLUTION_RESPONSE_EVENT,
  type DocumentResolver,
} from "./shared";

/** Serve this document's resolver to one immediate child iframe. */
export function installResolutionParent(
  events: EventsParent,
  resolve: DocumentResolver,
) {
  const stopListening = events.listen(async (event) => {
    if (event.type !== RESOLUTION_REQUEST_EVENT) return;
    event.preventDefault();
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const request = payload as Record<string, unknown>;
    if (
      typeof request.requestId !== "string" ||
      typeof request.src !== "string"
    ) {
      return;
    }

    try {
      events.send(RESOLUTION_RESPONSE_EVENT, {
        requestId: request.requestId,
        document: await resolve(request.src),
      });
    } catch (error) {
      events.send(RESOLUTION_RESPONSE_EVENT, {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { destroy: stopListening };
}
