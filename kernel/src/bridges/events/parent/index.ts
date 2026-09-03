import { EVENT_TO_CHILD, EVENT_TO_PARENT } from "../shared";

export function installEventsParent(iframe: HTMLIFrameElement) {
  let destroyed = false;
  const listeners = new Set<
    (eventName: string, payload: unknown) => void
  >();

  const onMessage = (event: MessageEvent<unknown>) => {
    if (iframe.contentWindow !== event.source) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== EVENT_TO_PARENT || typeof d.eventName !== "string") return;

    for (const listener of listeners) {
      listener(d.eventName, d.payload);
    }
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
    listen: (
      listener: (eventName: string, payload: unknown) => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
  };
}

export type EventsParent = ReturnType<typeof installEventsParent>;
