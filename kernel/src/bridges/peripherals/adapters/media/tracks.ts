import { mediaException, type MediaCommand, type MediaError, type TrackInfo } from "./shared";

type TrackGroup = ReturnType<typeof createTrackGroup>;
const groups = new WeakMap<MediaStreamTrack, TrackGroup>();
let installed = false;
let nativeStop: MediaStreamTrack["stop"];

/** Narrow prototype hooks also cover new MediaStream([track]).clone().
 * Unrelated tracks and streams retain their native methods and behavior. */
function installTrackControls() {
  if (installed) return;
  installed = true;
  const prototype = MediaStreamTrack.prototype;
  nativeStop = prototype.stop;
  const nativeClone = prototype.clone;
  const nativeStreamClone = MediaStream.prototype.clone;
  const nativeApply = prototype.applyConstraints;
  prototype.stop = function () {
    nativeStop.call(this);
    groups.get(this)?.release(this);
  };
  prototype.clone = function () {
    const clone = nativeClone.call(this);
    groups.get(this)?.add(clone);
    return clone;
  };
  MediaStream.prototype.clone = function () {
    return this.getTracks().some((track) => groups.has(track))
      ? new MediaStream(this.getTracks().map((track) => track.clone()))
      : nativeStreamClone.call(this);
  };
  prototype.applyConstraints = function (constraints = {}) {
    const group = groups.get(this);
    return group ? this.readyState === "ended" ? Promise.resolve() : group.apply(constraints)
      : nativeApply.call(this, constraints);
  };
  for (const [method, property] of [["getSettings", "settings"], ["getConstraints", "constraints"],
    ["getCapabilities", "capabilities"]] as const) {
    const native: (() => object) | undefined = prototype[method];
    Object.defineProperty(prototype, method, { configurable: true, writable: true,
      value: function (this: MediaStreamTrack) {
        const group = groups.get(this);
        return group ? structuredClone(group.info[property]) : native?.call(this) ?? {};
      } });
  }
}

export function createTrackGroup(info: TrackInfo, send: (command: MediaCommand) => Promise<unknown>,
  fail: (error: unknown) => void) {
  installTrackControls();
  const tracks = new Set<MediaStreamTrack>();
  const group = {
    info,
    add(track: MediaStreamTrack) {
      groups.set(track, group);
      const nativeMuted = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, "muted")?.get;
      const initialMuted = track.muted;
      Object.defineProperty(track, "muted", { configurable: true,
        get: () => !!group.info.muted || (nativeMuted ? nativeMuted.call(track) : initialMuted) });
      Object.defineProperty(track, "label", { configurable: true, get: () => group.info.label });
      if (track.readyState === "ended") return;
      tracks.add(track);
      track.addEventListener("ended", () => group.release(track), { once: true });
    },
    update(next: TrackInfo) {
      const previous = new Map([...tracks].map((track) => [track, track.muted]));
      group.info = next;
      for (const [track, muted] of previous) {
        if (track.muted !== muted) track.dispatchEvent(new Event(track.muted ? "mute" : "unmute"));
      }
    },
    release(track: MediaStreamTrack) {
      if (tracks.delete(track) && !tracks.size) {
        void send({ type: "stopTrack", kind: info.kind }).catch(fail);
      }
    },
    async apply(constraints: MediaTrackConstraints) {
      // TODO: independently adapt cloned tracks if a concrete use case needs it.
      // For now clones share capture settings; do not silently reconfigure siblings.
      if (tracks.size > 1) {
        throw new DOMException(
          "Changing constraints while cloned tracks are live is not supported. " +
          "Apply constraints before cloning, stop the other tracks, or request a separate capture.",
          "NotSupportedError",
        );
      }
      const result = await send({ type: "applyConstraints", kind: info.kind, constraints: structuredClone(constraints) }) as
        { track: TrackInfo } | { error: MediaError };
      if ("error" in result) throw mediaException(result.error);
      group.update(result.track);
    },
    end() {
      const remaining = [...tracks];
      tracks.clear();
      for (const track of remaining) {
        if (track.readyState === "ended") continue;
        nativeStop.call(track);
        track.dispatchEvent(new Event("ended"));
      }
    },
  };
  return group;
}
