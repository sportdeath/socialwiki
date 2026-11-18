import { afterEach, expect, it, vi } from "vitest";
import { createAudioEndpoint, receiveAudio } from "../src/bridges/peripherals/adapters/media/audio";

afterEach(() => vi.unstubAllGlobals());

it("cancels pending audio setup even before AudioContext.state becomes closed", async () => {
  let loaded!: () => void;
  const module = new Promise<void>((resolve) => { loaded = resolve; });
  const close = vi.fn(async () => {});
  class Context {
    state = "running"; // The exposed state can lag behind a close() request.
    audioWorklet = { addModule: () => module };
    resume = async () => {};
    close = close;
  }
  const createNode = vi.fn();
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("AudioWorkletNode", createNode);
  const endpoint = createAudioEndpoint(vi.fn());
  const pending = receiveAudio(endpoint, {} as MessagePort, 1);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  endpoint.stop();
  endpoint.stop();
  loaded();
  await rejected;
  expect(createNode).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});
