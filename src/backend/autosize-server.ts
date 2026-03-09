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

export function parseAutosizeSize(
  payload: unknown,
): { width: number; height: number } | null {
  // Size payload comes from an iframe; treat it as untrusted.
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.width !== "number" ||
    !Number.isFinite(p.width) ||
    p.width < 0 ||
    typeof p.height !== "number" ||
    !Number.isFinite(p.height) ||
    p.height < 0
  ) {
    return null;
  }

  return { width: p.width, height: p.height };
}

export function serveAutosize(host: HTMLElement, iframe?: HTMLIFrameElement) {
  let mode: AutosizeMode = "off";
  let baseWidth = "";
  let baseHeight = "";
  let hasBaseStyles = false;
  let appliedWidth = false;
  let appliedHeight = false;

  const captureBaseStyles = () => {
    if (hasBaseStyles) return;
    baseWidth = host.style.getPropertyValue("width");
    baseHeight = host.style.getPropertyValue("height");
    hasBaseStyles = true;
  };

  const restoreWidth = () => {
    if (!appliedWidth) return;
    if (baseWidth.length > 0) {
      host.style.setProperty("width", baseWidth);
    } else {
      host.style.removeProperty("width");
    }
    appliedWidth = false;
  };

  const restoreHeight = () => {
    if (!appliedHeight) return;
    if (baseHeight.length > 0) {
      host.style.setProperty("height", baseHeight);
    } else {
      host.style.removeProperty("height");
    }
    appliedHeight = false;
  };

  const applySize = (payload: unknown) => {
    if (mode === "off") return;

    const size = parseAutosizeSize(payload);
    if (size === null) return;

    if (mode === "height" || mode === "both") {
      host.style.height = `${size.height}px`;
      appliedHeight = true;
    }
    if (mode === "width" || mode === "both") {
      host.style.width = `${size.width}px`;
      appliedWidth = true;
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
    if (mode === "off" && nextMode !== "off") {
      // Preserve existing inline styles so turning autosize off restores them.
      captureBaseStyles();
    }
    mode = nextMode;

    if (mode === "off") {
      restoreWidth();
      restoreHeight();
      baseWidth = "";
      baseHeight = "";
      hasBaseStyles = false;
    } else if (mode === "height") {
      // Hand width back to the original inline style when not controlled.
      restoreWidth();
    } else if (mode === "width") {
      // Hand height back to the original inline style when not controlled.
      restoreHeight();
    }

    sendMode();
  };

  return {
    destroy,
    setMode,
    syncMode: sendMode,
  };
}
