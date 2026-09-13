// Events cross one iframe boundary at a time. Each endpoint may consume an
// event with preventDefault(); transparent documents like the View lens
// can explicitly continue unhandled events across their next boundary.
export const EVENT_TO_PARENT = "sw-event";
export const EVENT_TO_CHILD = "sw-event-in";

export type BridgedEvent = CustomEvent<unknown>;

declare global {
  interface Window {
    emit: (eventName: string, payload?: unknown) => void;

    /**
     * Receives events sent into this document after its bridge and DOM
     * listeners decline them. A transparent lens (e.g. the View lens)
     * can forward them to the document it contains; ordinary documents
     * leave this unset.
     */
    onUnhandledEvent?: (event: BridgedEvent) => void;
  }
}
