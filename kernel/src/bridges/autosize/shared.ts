export const AUTOSIZE_SIZE_EVENT = "sw-autosize-size";

export type AutosizeMode = "off" | "height" | "width" | "both";

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
