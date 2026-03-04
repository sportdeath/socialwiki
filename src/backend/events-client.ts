declare global {
  interface Window {
    emit: (eventName: string, payload?: unknown) => void;
  }
}

export function installEventBridge() {
  window.emit = (eventName: string, payload?: unknown) => {
    window.parent?.postMessage(
      {
        type: "sw-event",
        eventName,
        payload,
      },
      "*",
    );
  };

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== "sw-event-in" || typeof d.eventName !== "string") return;

    window.dispatchEvent(
      new CustomEvent(d.eventName, {
        detail: d.payload,
      }),
    );
  });
}
