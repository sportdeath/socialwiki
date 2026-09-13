import {
  EVENT_TO_CHILD,
  EVENT_TO_PARENT,
  type BridgedEvent,
} from "./shared";

export function installEventsChild() {
  const listeners = new Map<string, Set<(event: BridgedEvent) => void>>();

  const emit = (eventName: string, payload?: unknown) => {
    window.parent?.postMessage(
      {
        type: EVENT_TO_PARENT,
        eventName,
        payload,
      },
      // Sandboxed srcdoc documents have opaque origins. Both halves bind the
      // connection by Window identity instead.
      "*",
    );
  };
  window.emit = emit;

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== EVENT_TO_CHILD || typeof d.eventName !== "string") return;

    const childEvent = new CustomEvent(d.eventName, {
      detail: d.payload,
      cancelable: true,
    });
    for (const listener of listeners.get(d.eventName) ?? []) {
      listener(childEvent);
    }
    if (!childEvent.defaultPrevented) window.dispatchEvent(childEvent);
    if (!childEvent.defaultPrevented) window.onUnhandledEvent?.(childEvent);
  };

  window.addEventListener("message", onMessage);
  return {
    emit,
    /**
     * Observe one incoming event name. preventDefault() consumes it without
     * hiding it from other listeners; call it before awaiting async work.
     */
    listen(eventName: string, receive: (event: BridgedEvent) => void) {
      let eventListeners = listeners.get(eventName);
      if (!eventListeners) {
        eventListeners = new Set();
        listeners.set(eventName, eventListeners);
      }
      eventListeners.add(receive);
      return () => {
        eventListeners.delete(receive);
        if (eventListeners.size === 0) listeners.delete(eventName);
      };
    },
  };
}

export type EventsChild = ReturnType<typeof installEventsChild>;
