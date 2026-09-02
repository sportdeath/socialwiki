import { serveEvents } from "./events-server";

export function serveNavigation(
  onNavigate: (to: string) => void,
  iframe?: HTMLIFrameElement,
) {
  const { destroy, send } = serveEvents((eventName, payload) => {
    if (eventName !== "sw-navigate") return;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.to !== "string") return;

    onNavigate(p.to);
  }, iframe);

  return {
    destroy,
    setQuery: (query: string) => {
      send("sw-query", { query });
    },
  };
}
