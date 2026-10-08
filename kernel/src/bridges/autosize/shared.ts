export const AUTOSIZE_SIZE_EVENT = "sw-autosize-size";
export const AUTOSIZE_MODE_EVENT = "sw-autosize-mode";

export type AutosizeMode = "off" | "height" | "width" | "both";
// A size report always includes both axes. The immediate parent chooses which
// ones to apply, so changing modes does not require another measurement.
export type AutosizeSize = { width: number; height: number };
// Local to one document, not a request to forward the outer frame's raw size.
// This lets nested transclusions inherit a lens's mode while the lens reports
// its own measured layout (including any header) to its parent.
export type AutosizeContext = {
  readonly mode: AutosizeMode;
  subscribe(listener: (mode: AutosizeMode) => void): () => void;
};

export function isAutosizeSize(value: unknown): value is AutosizeSize {
  // An iframe controls this payload. Non-finite or negative values must not
  // reach CSS sizing, where they could leave a host at an unusable size.
  if (typeof value !== "object" || value === null) return false;
  const size = value as Record<string, unknown>;
  return typeof size.width === "number" && Number.isFinite(size.width) && size.width >= 0 &&
    typeof size.height === "number" && Number.isFinite(size.height) && size.height >= 0;
}

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
