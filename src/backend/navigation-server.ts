import { serveEvents } from "./events-server";

export function serveNavigation(
  onNavigate: (to: string, top?: boolean) => void,
  iframe?: HTMLIFrameElement,
) {
  const { destroy, send } = serveEvents((eventName, payload) => {
    if (eventName !== "sw-navigate") return;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (
      typeof p.to !== "string" ||
      (typeof p.top !== "boolean" && p.top !== undefined)
    )
      return;

    onNavigate(p.to, p.top);
  }, iframe);

  return {
    destroy,
    setFragment: (fragment: string) => {
      send("sw-fragment", { fragment });
    },
  };
}
