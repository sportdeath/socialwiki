export type MediaKind = "audio" | "video";
export const mediaKinds: MediaKind[] = ["audio", "video"];
export type MediaError = { name: string; message: string; constraint?: string };
export type TrackInfo = {
  kind: MediaKind;
  muted?: boolean;
  label: string;
  settings: MediaTrackSettings;
  constraints: MediaTrackConstraints;
  capabilities: MediaTrackCapabilities;
};
export type MediaSignal =
  | { type: "description"; description: RTCSessionDescriptionInit; tracks?: TrackInfo[] }
  | { type: "candidate"; candidate: RTCIceCandidateInit | null };
export type MediaCommand = MediaSignal
  | { type: "stopTrack"; kind: MediaKind }
  | { type: "applyConstraints"; kind: MediaKind; constraints: MediaTrackConstraints };
export type MediaEvent = MediaSignal | { type: "trackEnded"; kind: MediaKind }
  | { type: "trackState"; track: TrackInfo };

/** Only audio/video select devices. Native capture validates constraint dictionaries. */
export function normalizeConstraints(value: MediaStreamConstraints = {}): MediaStreamConstraints {
  if (!value || typeof value !== "object") throw new TypeError("Media constraints must be an object.");
  const result: MediaStreamConstraints = {};
  for (const kind of mediaKinds) {
    const option = value[kind];
    result[kind] = option && typeof option === "object" ? structuredClone(option) : Boolean(option);
  }
  if (!result.audio && !result.video) throw new TypeError("Request audio, video, or both.");
  return result;
}
export function serializeMediaError(error: unknown): MediaError {
  const value = error as Partial<MediaError> | null;
  return { name: value?.name || "NotReadableError", message: value?.message || "Media capture failed.",
    ...(typeof value?.constraint === "string" ? { constraint: value.constraint } : {}) };
}
export function mediaException(error: MediaError): Error {
  const result = error.name === "TypeError" ? new TypeError(error.message) : new DOMException(error.message, error.name);
  if (error.constraint !== undefined) Object.defineProperty(result, "constraint", { value: error.constraint });
  return result;
}
export function trackInfo(track: MediaStreamTrack): TrackInfo {
  return { kind: track.kind as MediaKind, muted: track.muted, label: track.label, settings: track.getSettings(),
    constraints: track.getConstraints(), capabilities: track.getCapabilities?.() ?? {} };
}
