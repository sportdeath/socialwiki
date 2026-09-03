import { EVENT_TO_CHILD, EVENT_TO_PARENT } from "../shared";

declare global {
  interface Window {
    emit: (eventName: string, payload?: unknown) => void;
  }
}

export function installEventsChild() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

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

    for (const listener of listeners.get(d.eventName) ?? []) {
      listener(d.payload);
    }
    window.dispatchEvent(new CustomEvent(d.eventName, { detail: d.payload }));
  };

  window.addEventListener("message", onMessage);
  return {
    emit,
    listen(eventName: string, receive: (payload: unknown) => void) {
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
