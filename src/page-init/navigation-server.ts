export function serveNavigation(onNavigate: (to: string) => void) {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== "navigate" || typeof d.to !== "string") return;

    const to = d.to;
    onNavigate(to);
  });
}
