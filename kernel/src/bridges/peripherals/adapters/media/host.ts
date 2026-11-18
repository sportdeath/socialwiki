import type { HostAdapter } from "../../shared";
import { watchMediaDevices } from "./devices";
import { createAudioEndpoint } from "./audio";
import { createVideoSender } from "./video";
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
          let video: ReturnType<typeof createVideoSender> | undefined;
          let audio: ReturnType<typeof createAudioEndpoint> | undefined;
          let audioPort: MessagePort | undefined;
          let audioTimer: ReturnType<typeof setTimeout> | undefined;
          const emit = (value: MediaEvent) => {
            if (!stopped) update({ type: "data", value, ...("port" in value ? { transferables: [value.port] } : {}) });
          };
          const stop = () => {
            if (stopped) return;
            stopped = true;
            clearTimeout(audioTimer);
            video?.stop();
            audioPort?.close();
            audio?.stop();
            stream?.getTracks().forEach((track) => track.stop());
          };
          const fail = (error: unknown) => {
            if (stopped) return;
            stop();
            update({ type: "error", ...serializeMediaError(error) });
          };
          const ended = (track: MediaStreamTrack) => {
            if (stopped) return;
            if (track.kind === "video") video?.stop();
            else { clearTimeout(audioTimer); audioPort?.close(); audio?.stop(); }
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
            for (const track of stream.getTracks()) {
              track.addEventListener("ended", () => ended(track), { once: true });
              const state = () => emit({ type: "trackState", track: trackInfo(track) });
              track.addEventListener("mute", state);
              track.addEventListener("unmute", state);
            }
            if (constraints.video) {
              const track = stream.getVideoTracks()[0];
              video = createVideoSender(track, fail);
              emit({ type: "video", port: video.port, track: trackInfo(track) });
            }
            if (constraints.audio) {
              const track = stream.getAudioTracks()[0];
              audio = createAudioEndpoint(fail);
              audioTimer = setTimeout(() => fail(new DOMException(
                `Microphone opened, but the host audio context did not start (${audio!.context.state}).`,
                "NotReadableError")), 15000);
              await audio.ready;
              clearTimeout(audioTimer);
              if (stopped) return;
              const channels = track.getSettings().channelCount ?? 1;
              const sender = audio.node("send", channels);
              audio.context.createMediaStreamSource(new MediaStream([track])).connect(sender);
              sender.connect(audio.context.destination); // The sender outputs silence, never microphone monitoring.
              audioPort = sender.port;
              emit({ type: "audio", port: sender.port, channels, track: trackInfo(track) });
            }
          })().catch(fail);
          return { stop, async send(value) {
            if (stopped || !stream) throw new Error("Media request is unavailable.");
            const command = value as MediaCommand;
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
