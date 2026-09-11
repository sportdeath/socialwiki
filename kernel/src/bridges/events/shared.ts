// Events emitted by a child are exposed on its <sw-transclude>, unless a
// bridge intercepts the name. The containing document chooses whether to
// forward unhandled events through the element's onUnhandledEvent callback.
export const EVENT_TO_PARENT = "sw-event";
export const EVENT_TO_CHILD = "sw-event-in";
