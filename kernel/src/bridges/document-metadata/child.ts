import type { EventsChild } from "../events/child";
import { DOCUMENT_METADATA_EVENT, readDocumentMetadata } from "./shared";

/** Report the document's native title and icon, including later DOM changes. */
export function installDocumentMetadataChild(events: Pick<EventsChild, "emit">) {
  let lastSnapshot = "";
  let ready = document.readyState === "complete";
  const report = () => {
    if (!ready) return;
    const metadata = readDocumentMetadata();
    const snapshot = JSON.stringify(metadata);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    events.emit(DOCUMENT_METADATA_EVENT, metadata);
  };

  const observer = new MutationObserver(report);
  observer.observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "rel"],
  });

  // Parent endpoints are installed after the iframe is appended. Match the
  // navigation bridge's load handshake so the first snapshot is not lost.
  const onLoad = () => {
    ready = true;
    report();
  };
  if (ready) report();
  else window.addEventListener("load", onLoad, { once: true });

  return {
    destroy() {
      observer.disconnect();
      window.removeEventListener("load", onLoad);
    },
  };
}
