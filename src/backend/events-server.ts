export function serveEvents(
  onEvent: (eventName: string, payload: unknown) => void,
  iframe?: HTMLIFrameElement,
) {
  const onMessage = (event: MessageEvent<unknown>) => {
    if (iframe && iframe.contentWindow !== event.source) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== "sw-event" || typeof d.eventName !== "string") return;

    onEvent(d.eventName, d.payload);
  };

  window.addEventListener("message", onMessage);
  return {
    destroy: () => window.removeEventListener("message", onMessage),
    send: (eventName: string, payload?: unknown) => {
      if (!iframe) return;
      iframe.contentWindow?.postMessage(
        {
          type: "sw-event-in",
          eventName,
          payload,
        },
        "*",
      );
    },
  };
}
