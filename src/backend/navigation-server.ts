export function serveNavigation(
  onNavigate: (to: string, fromSrcdoc: string | null) => void,
) {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (
      d.type !== "navigate" ||
      typeof d.to !== "string" ||
      (typeof d.fromSrcdoc !== "string" && d.fromSrcdoc !== null)
    )
      return;

    onNavigate(d.to, d.fromSrcdoc);
  });
}
