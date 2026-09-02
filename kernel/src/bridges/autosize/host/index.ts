import { serveEvents } from "./events-server";

export type AutosizeMode = "off" | "height" | "width" | "both";

export function parseAutosizeMode(value: string | null): AutosizeMode {
  if (value === null) return "off";

  const normalized = value.trim().toLowerCase();
  // A bare `autosize` attribute (`autosize=""`) follows HTML boolean-style
  // usage and enables both axes.
  if (normalized === "") return "both";
  if (
    normalized === "height" ||
    normalized === "width" ||
    normalized === "both"
  ) {
    return normalized;
  }
  return "off";
}

export function serveAutosize(host: HTMLElement, iframe?: HTMLIFrameElement) {
  let mode: AutosizeMode = "off";

  const applySize = (payload: unknown) => {
    if (mode === "off") return;

    // Size payload comes from an iframe; treat it as untrusted.
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (
      typeof p.width !== "number" ||
      !Number.isFinite(p.width) ||
      p.width < 0 ||
      typeof p.height !== "number" ||
      !Number.isFinite(p.height) ||
      p.height < 0
    ) {
      return;
    }

    if (mode === "height" || mode === "both") {
      host.style.height = `${p.height}px`;
    }
    if (mode === "width" || mode === "both") {
      host.style.width = `${p.width}px`;
    }
  };

  const { destroy, send } = serveEvents((eventName, payload) => {
    if (eventName !== "sw-autosize-size") return;
    applySize(payload);
  }, iframe);

  const sendMode = () => {
    // Child can reload/recreate documents; mode must be resent on demand.
    send("sw-autosize-mode", { mode });
  };

  const setMode = (nextMode: AutosizeMode) => {
    mode = nextMode;

    if (mode === "off") {
      host.style.removeProperty("width");
      host.style.removeProperty("height");
    } else if (mode === "height") {
      host.style.removeProperty("width");
    } else if (mode === "width") {
      host.style.removeProperty("height");
    }

    sendMode();
  };

  return {
    destroy,
    setMode,
    syncMode: sendMode,
  };
}
