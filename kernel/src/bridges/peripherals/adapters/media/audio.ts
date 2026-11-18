import { registerAudioBridge } from "./audio-worklet";

/** Both contexts use the same rate; Web Audio resamples the native microphone input. */
export function createAudioEndpoint(fail: (error: unknown) => void) {
  if (typeof AudioContext !== "function" || typeof AudioWorkletNode !== "function") {
    throw new DOMException("Local microphone delivery requires AudioWorklet support.", "NotSupportedError");
  }
  const context = new AudioContext({ sampleRate: 48000 });
  let stopped = false;
  // Call resume synchronously, while the app's click/tap activation is still available.
  const running = context.resume();
  // Safari rejects blob URLs created in opaque sandboxed frames. Keep the module
  // inline with a data URL, which does not depend on the frame's origin.
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(`(${registerAudioBridge.toString()})();`)}`;
  const ready = Promise.all([running, context.audioWorklet.addModule(url)]);
  void ready.catch(fail);
  context.onstatechange = () => {
    if (context.state === "closed") fail(new DOMException("The local audio context closed.", "NotReadableError"));
  };
  return {
    context, ready,
    node(direction: "send" | "receive", channels: number) {
      if (stopped || context.state === "closed") throw new DOMException("Microphone capture ended.", "AbortError");
      const node = new AudioWorkletNode(context, `socialwiki-audio-${direction}`, {
        numberOfInputs: direction === "send" ? 1 : 0,
        numberOfOutputs: direction === "send" ? 1 : 2,
        outputChannelCount: direction === "send" ? [channels] : [channels, 1],
        channelCount: channels, channelCountMode: "explicit", processorOptions: { channels },
      });
      // The receiver's second output stays silent. Drive it before an app attaches
      // a recorder/player to the returned stream, without monitoring the microphone.
      if (direction === "receive") node.connect(context.destination, 1);
      node.onprocessorerror = () => fail(new DOMException("The local audio processor failed.", "NotReadableError"));
      return node;
    },
    stop() {
      if (stopped) return;
      stopped = true; // AudioContext.state need not change until close() finishes.
      context.onstatechange = null;
      if (context.state !== "closed") void context.close().catch(() => {});
    },
  };
}

export async function receiveAudio(endpoint: ReturnType<typeof createAudioEndpoint>, port: MessagePort, channels: number) {
  await endpoint.ready;
  const node = endpoint.node("receive", channels);
  const destination = endpoint.context.createMediaStreamDestination();
  destination.channelCount = channels;
  const ready = new Promise<MediaStreamTrack>((resolve) => {
    node.port.onmessage = ({ data }) => {
      if (data === "ready") resolve(destination.stream.getAudioTracks()[0]);
    };
  });
  node.connect(destination);
  node.port.postMessage(port, [port]);
  return ready;
}
