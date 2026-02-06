export function serveNavigation(
  onNavigate: (to: string, top?: boolean) => void,
  iframe?: HTMLIFrameElement,
) {
  const onMessage = (event: MessageEvent<unknown>) => {
    if (iframe && iframe.contentWindow !== event.source) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (
      d.type !== "sw-navigate" ||
      typeof d.to !== "string" ||
      (typeof d.top !== "boolean" && d.top !== undefined)
    )
      return;

    onNavigate(d.to, d.top);
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
