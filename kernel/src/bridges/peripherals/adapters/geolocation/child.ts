import type { PeripheralsService } from "../../shared";
import { normalizeOptions, type LocationUpdate } from "./shared";

export function installGeolocationAdapter(service: PeripheralsService) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true, enumerable: true, value: createGeolocationFacade(service),
  });
}

/** Native call signatures and synchronous IDs, with callbacks kept in this realm. */
export function createGeolocationFacade(service: Pick<PeripheralsService, "start">): Geolocation {
  let nextId = 1;
  const watches = new Map<number, () => void>();
  function start(watch: boolean, success: PositionCallback,
    error?: PositionErrorCallback | null, options?: PositionOptions) {
    if (typeof success !== "function") throw new TypeError("A success callback is required.");
    if (error != null && typeof error !== "function") throw new TypeError("Invalid error callback.");
    const args = [normalizeOptions(options)];
    const id = nextId++;
    let cancelled = false;
    const cancel = () => { cancelled = true; stop(); watches.delete(id); };
    const { stop } = service.start({ source: [], capability: "geolocation",
      method: watch ? "watchPosition" : "getCurrentPosition", args }, (event) => {
      // Preserve native asynchronous callbacks even when a local service fails early.
      setTimeout(() => {
        if (cancelled) return;
        if (event.type === "end") { cancel(); return; }
        const value: LocationUpdate = event.type === "data" ? event.value as LocationUpdate
          : { error: { code: event.name === "NotAllowedError" ? 1 : 2, message: event.message } };
        if (!watch || ("error" in value && value.error.code === 1) || event.type === "error") cancel();
        if ("position" in value) {
          const coords = Object.freeze({ ...value.position.coords,
            toJSON: () => ({ ...value.position.coords }) });
          const position = Object.freeze({ coords, timestamp: value.position.timestamp,
            toJSON: () => ({ coords: coords.toJSON(), timestamp: value.position.timestamp }) });
          success(position);
        } else {
          error?.(Object.freeze({ ...value.error,
            PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
        }
      }, 0);
    });
    if (watch) watches.set(id, cancel);
    return id;
  }
  return {
    getCurrentPosition(success, error, options) { start(false, success, error, options); },
    watchPosition(success, error, options) { return start(true, success, error, options); },
    clearWatch(id) { watches.get(Number(id) >> 0)?.(); },
  };
}
