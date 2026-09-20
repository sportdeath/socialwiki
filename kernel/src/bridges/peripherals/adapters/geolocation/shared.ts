export type Coordinates = Pick<GeolocationCoordinates,
  "latitude" | "longitude" | "accuracy" | "altitude" | "altitudeAccuracy" | "heading" | "speed">;
export type Position = { coords: Coordinates; timestamp: number };
export type LocationError = { code: 1 | 2 | 3; message: string };
export type LocationUpdate = { position: Position } | { error: LocationError };

// Serialize only the standard fields. The native API handles range clamping;
// there is no need to reimplement its WebIDL conversion rules here.
export function normalizeOptions(options?: PositionOptions | null): PositionOptions {
  if (options != null && typeof options !== "object" && typeof options !== "function") {
    throw new TypeError("Position options must be an object.");
  }
  const { enableHighAccuracy = false, maximumAge = 0, timeout = Infinity } = options ?? {};
  return { enableHighAccuracy: Boolean(enableHighAccuracy), maximumAge: Number(maximumAge), timeout: Number(timeout) };
}

export function serializePosition(position: GeolocationPosition): Position {
  const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
  return { timestamp: position.timestamp,
    coords: { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } };
}
