// These globals exist in AudioWorkletGlobalScope, not Window's DOM typings.
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string,
  processor: new (options: { processorOptions: { channels: number } }) => AudioWorkletProcessor): void;

/** Self-contained: its compiled source is loaded as an inline data URL module. */
export function registerAudioBridge() {
  const frames = 1024;
  const capacity = 4;
  class Sender extends AudioWorkletProcessor {
    channels: number;
    buffer: Float32Array<ArrayBuffer>;
    offset = 0;
    credits = 0;
    constructor(options: { processorOptions: { channels: number } }) {
      super();
      this.channels = options.processorOptions.channels;
      this.buffer = new Float32Array(frames * this.channels);
      this.port.onmessage = ({ data }) => {
        this.credits = Math.min(capacity, this.credits + data.pull);
      };
    }
    process(inputs: Float32Array[][]) {
      const input = inputs[0];
      if (!input?.length) return true;
      for (let i = 0; i < input[0].length; i++) {
        for (let channel = 0; channel < this.channels; channel++) {
          this.buffer[this.offset++] = input[channel]?.[i] ?? 0;
        }
        if (this.offset !== this.buffer.length) continue;
        if (this.credits > 0) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(frames * this.channels);
          this.credits--;
        }
        // Drop unsent audio instead of accumulating it while the receiver is paused.
        this.offset = 0;
      }
      return true;
    }
  }
  class Receiver extends AudioWorkletProcessor {
    wire?: MessagePort;
    queue: Float32Array[] = [];
    offset = 0;
    playing = false;
    notified = false;
    constructor() {
      super();
      this.port.onmessage = ({ data }: MessageEvent<MessagePort>) => {
        this.wire = data;
        this.wire.onmessage = ({ data }: MessageEvent<Float32Array>) => this.queue.push(data);
        this.wire.postMessage({ pull: capacity });
      };
    }
    process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
      // A two-block cushion absorbs message scheduling jitter. Refill after an underrun.
      if (!this.playing && this.queue.length < 2) return true;
      this.playing = true;
      const output = outputs[0];
      for (let i = 0; i < output[0].length; i++) {
        const buffer = this.queue[0];
        if (!buffer) { this.playing = false; break; }
        for (const channel of output) channel[i] = buffer[this.offset++];
        if (this.offset === buffer.length) {
          this.queue.shift();
          this.offset = 0;
          this.wire!.postMessage({ pull: 1 });
        }
      }
      if (!this.notified) { this.notified = true; this.port.postMessage("ready"); }
      return true;
    }
  }
  registerProcessor("socialwiki-audio-send", Sender);
  registerProcessor("socialwiki-audio-receive", Receiver);
}
