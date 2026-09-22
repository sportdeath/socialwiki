import type { HostAdapter } from "../../shared";
import { watchMediaDevices } from "./devices";
import { createMediaPeer } from "./peer";
import { normalizeConstraints, serializeMediaError, trackInfo,
  type MediaCommand, type MediaEvent } from "./shared";

export function createMediaAdapter(native: MediaDevices | undefined = navigator.mediaDevices): HostAdapter {
  return {
    features: { ...(typeof native?.getUserMedia === "function" ? { media: native.getSupportedConstraints?.() ?? {} } : {}),
      enumerateDevices: !!native?.enumerateDevices },
    prepare(method, args, context) {
      if (method === "enumerateDevices" || method === "watchDevices") {
        if (args.length || !context || !native?.enumerateDevices) throw new TypeError("Device enumeration unavailable.");
        return { permissions: [], start: (update) => watchMediaDevices(native, context, method === "watchDevices", update) };
      }
      if (method !== "getUserMedia" || args.length !== 1) throw new TypeError("Unknown media operation.");
      const constraints = normalizeConstraints(args[0] as MediaStreamConstraints);
      return {
        permissions: (["video", "audio"] as const).filter((kind) => constraints[kind]).map((kind) => ({
          capability: kind === "audio" ? "microphone" : "camera",
          label: kind === "audio" ? "microphone" : "camera",
        })),
        start(update) {
          let stopped = false;
          let stream: MediaStream | undefined;
          let peer: ReturnType<typeof createMediaPeer> | undefined;
          const emit = (value: MediaEvent) => { if (!stopped) update({ type: "data", value }); };
          const stop = () => {
            if (stopped) return;
            stopped = true;
            peer?.close();
            stream?.getTracks().forEach((track) => track.stop());
          };
          const fail = (error: unknown) => {
            if (stopped) return;
            stop();
            update({ type: "error", ...serializeMediaError(error) });
          };
          const ended = (track: MediaStreamTrack) => {
            if (stopped) return;
            emit({ type: "trackEnded", kind: track.kind as "audio" | "video" });
            if (stream!.getTracks().every((item) => item.readyState === "ended")) {
              stop();
              update({ type: "end" });
            }
          };
          void (async () => {
            if (!native) throw new DOMException("Media capture is unavailable in this host.", "NotSupportedError");
            // Native permission prompts cannot be cancelled. Dispose a late result immediately.
            const captured = await native.getUserMedia(constraints);
            if (stopped) { captured.getTracks().forEach((track) => track.stop()); return; }
            stream = captured;
            peer = createMediaPeer(async (signal) => emit(signal), fail);
            for (const track of stream.getTracks()) {
              peer.pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
              track.addEventListener("ended", () => ended(track), { once: true });
              const state = () => emit({ type: "trackState", track: trackInfo(track) });
              track.addEventListener("mute", state);
              track.addEventListener("unmute", state);
            }
            await peer.pc.setLocalDescription(await peer.pc.createOffer());
            if (stopped) return;
            emit({ type: "description", description: peer.pc.localDescription!.toJSON(),
              tracks: stream.getTracks().map(trackInfo) });
          })().catch(fail);
          return { stop, async send(value) {
            if (stopped || !peer || !stream) throw new Error("Media request is unavailable.");
            const command = value as MediaCommand;
            if (command?.type === "description" || command?.type === "candidate") {
              if (command.type === "description" && command.description?.type !== "answer") {
                throw new TypeError("Expected a media answer.");
              }
              try { await peer.receive(command); } catch (error) { fail(error); throw error; }
              return;
            }
            if (command?.type !== "stopTrack" && command?.type !== "applyConstraints") {
              throw new TypeError("Unknown media command.");
            }
            const track = stream.getTracks().find((track) => track.kind === command.kind);
            if (!track) throw new TypeError("Unknown media track.");
            if (command.type === "stopTrack") {
              if (track.readyState !== "ended") { track.stop(); ended(track); }
              return;
            }
            try {
              await track.applyConstraints(command.constraints);
              return { track: trackInfo(track) };
            } catch (error) { return { error: serializeMediaError(error) }; }
          } };
        },
      };
    },
  };
}
