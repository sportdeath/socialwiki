import type { HostAdapter } from "../../shared";
import { normalizeOptions, serializePosition, type LocationUpdate } from "./shared";

export function createGeolocationAdapter(native: Geolocation | undefined = navigator.geolocation): HostAdapter {
  return {
    features: { geolocation: !!native },
    prepare(method, args) {
      if (!["getCurrentPosition", "watchPosition"].includes(method) || args.length !== 1) {
        throw new TypeError("Unknown geolocation operation");
      }
      const options = normalizeOptions(args[0] as PositionOptions);
      return { permissions: [{ capability: "geolocation", label: "location" }], start(update) {
        if (!native) throw new Error("Geolocation is unavailable");
        let stopped = false;
        const stop = () => {
          stopped = true;
          native.clearWatch(watch);
        };
        const deliver = (value: LocationUpdate) => {
          if (stopped) return;
          update({ type: "data", value });
          if (method === "getCurrentPosition" || ("error" in value && value.error.code === 1)) {
            update({ type: "end" });
          }
        };
        // Even a one-shot is cancellable before the first fix with a native watch.
        const watch = native.watchPosition(
          (position) => deliver({ position: serializePosition(position) }),
          ({ code, message }) => deliver({ error: { code: code === 1 || code === 3 ? code : 2, message } }),
          options,
        );
        return { stop };
      } };
    },
  };
}
