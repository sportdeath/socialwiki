import { EVENT_TO_CHILD, EVENT_TO_PARENT } from "./shared";

type Listener = (event: CustomEvent<unknown>) => void;

export function installEventsParent(
  iframe: HTMLIFrameElement,
  passThrough?: Listener,
) {
  let destroyed = false;
  const listeners = new Set<Listener>();

  const onMessage = (event: MessageEvent<unknown>) => {
    if (iframe.contentWindow !== event.source) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== EVENT_TO_PARENT || typeof d.eventName !== "string") return;

    const childEvent = new CustomEvent(d.eventName, {
      detail: d.payload,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    for (const listener of listeners) listener(childEvent);
    if (!childEvent.defaultPrevented) passThrough?.(childEvent);
  };

  window.addEventListener("message", onMessage);
  const send = (eventName: string, payload?: unknown) => {
    if (destroyed) return;
    iframe.contentWindow?.postMessage(
      {
        type: EVENT_TO_CHILD,
        eventName,
        payload,
      },
      // The sandboxed child has an opaque origin; onMessage checks its Window.
      "*",
    );
  };

  return {
    destroy: () => {
      destroyed = true;
      window.removeEventListener("message", onMessage);
      listeners.clear();
    },
    /**
     * Observe child events. preventDefault() consumes an event without hiding
     * it from other listeners; call it before awaiting asynchronous work.
     */
    listen: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
  };
}

export type EventsParent = ReturnType<typeof installEventsParent>;
