// Events cross one iframe boundary at a time. Each endpoint may consume an
// event with preventDefault(); transparent documents like the View lens
// can explicitly continue unhandled events across their next boundary.
export const EVENT_TO_PARENT = "sw-event";
export const EVENT_TO_CHILD = "sw-event-in";

export type BridgedEvent = CustomEvent<unknown>;

/** Bridged names are custom-event names and must not collide with native DOM events. */
export function isBridgedEventName(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("sw-");
}

export function assertBridgedEventName(
  value: unknown,
): asserts value is string {
  if (!isBridgedEventName(value)) {
    throw new TypeError('Bridged event names must start with "sw-"');
  }
}

declare global {
  interface Window {
    /** Emit an `sw-`-prefixed custom event to the containing transclusion. */
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
