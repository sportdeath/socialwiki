export const AUTOSIZE_MODE_EVENT = "sw-autosize-mode";
export const AUTOSIZE_FALLBACK_EVENT = "sw-autosize-fallback";

export type AutosizeMode = "off" | "height" | "width" | "both";
// Local to one document, not a request to forward the outer frame's raw size.
// This lets nested transclusions inherit a lens's mode while the lens reports
// its own measured layout (including any header) to its parent.
export type AutosizeContext = {
  readonly mode: AutosizeMode;
  subscribe(listener: (mode: AutosizeMode) => void): () => void;
};

export function parseAutosizeMode(value: unknown): AutosizeMode {
  if (typeof value !== "string") return "off";
  const normalized = value.trim().toLowerCase();
  return normalized === "height" ||
    normalized === "width" ||
    normalized === "both"
    ? normalized
    : "off";
}

export const autosizesWidth = (mode: AutosizeMode) =>
  mode === "width" || mode === "both";

export const autosizesHeight = (mode: AutosizeMode) =>
  mode === "height" || mode === "both";
