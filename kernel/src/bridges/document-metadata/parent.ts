import type { EventsParent } from "../events/parent";
import { DOCUMENT_METADATA_EVENT, isDocumentMetadata } from "./shared";

/** Reject malformed metadata before the event reaches a containing document. */
export function installDocumentMetadataParent(events: EventsParent) {
  const stopListening = events.listen((event) => {
    if (event.type === DOCUMENT_METADATA_EVENT &&
      !isDocumentMetadata(event.detail)) event.preventDefault();
  });
  return { destroy: stopListening };
}
