import instrument from "./browser/media-diagnostic/instrument.js?raw";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

class Track extends EventTarget { kind = "video"; }
class Peer extends EventTarget {
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "gathering";
  signalingState = "stable";
  localDescription: { type: string; sdp: string } | undefined;
  onicecandidate: unknown;
  sender = {};
  transceiver = { sender: this.sender };
  addTrack = vi.fn(() => this.sender);
  addTransceiver = vi.fn(() => this.transceiver);
  getTransceivers() { return [this.transceiver]; }
  setRemoteDescription = vi.fn(async () => {});
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn();
  async setLocalDescription(value: { type: string; sdp: string }) { this.localDescription = value; }
  async getStats() {
    return new Map<string, Record<string, unknown>>([
      ["local", { type: "local-candidate", address: "192.0.2.1", candidateType: "host", protocol: "udp" }],
      ["remote", { type: "remote-candidate", address: "private-device.local", candidateType: "host", protocol: "udp" }],
      ["pair", { type: "candidate-pair", localCandidateId: "local", remoteCandidateId: "remote", state: "failed", requestsSent: 5 }],
    ]);
  }
}
function setup(variant = "baseline") {
  vi.useFakeTimers();
  const entries: { event: string; detail: Record<string, unknown> }[] = [];
  const window = { mediaDiagnosticConfig: { variant }, RTCPeerConnection: Peer,
    top: { postMessage: (entry: typeof entries[number]) => entries.push(entry) } };
  runInNewContext(instrument, { window, MediaStreamTrack: Track, crypto,
    isSecureContext: false, location: { protocol: "data:" }, Date,
    setTimeout, clearTimeout, setInterval, clearInterval });
  return { pc: new window.RTCPeerConnection(), entries };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe("manual media diagnostic hooks", () => {
  it("keeps baseline operations intact and sanitizes candidates, SDP and stats", async () => {
    const { pc, entries } = setup();
    const candidate = { candidate: "candidate:secret 1 udp 100 192.0.2.1 12345 typ host", sdpMid: "0" };
    const event = new Event("icecandidate"); Object.assign(event, { candidate }); pc.dispatchEvent(event);
    await pc.addIceCandidate(candidate as never);
    await pc.setLocalDescription({ type: "offer", sdp: "m=video 12345 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\na=ice-pwd:secret-password\r\na=fingerprint:sha-256 secret-fingerprint\r\na=candidate:secret 1 udp 100 192.0.2.1 12345 typ host\r\n" });
    await vi.advanceTimersByTimeAsync(1000);
    pc.close(); await flush();
    const json = JSON.stringify(entries);
    for (const secret of ["192.0.2.1", "private-device.local", "secret-password", "secret-fingerprint", "12345"]) {
      expect(json).not.toContain(secret);
    }
    expect(json).toContain('"addressClass":"ipv4"');
    expect(json).toContain('"addressClass":"mdns"');
    expect(json).toContain('"requestsSent":5');
    expect(entries.find((entry) => entry.event === "setLocalDescription-done")?.detail.candidateCount).toBe(1);
    expect(pc.localDescription?.sdp).toContain("secret-password"); // Only reporting is redacted.
    expect(vi.getTimerCount()).toBe(0);
  });
  it("changes only track-based transceiver creation in the addTrack variant", () => {
    const { pc, entries } = setup("add-track");
    const track = new Track();
    expect(pc.addTransceiver(track as never)).toBe(pc.transceiver);
    expect(pc.addTrack).toHaveBeenCalledWith(track);
    expect(entries.some((entry) => entry.event === "variant-addTrack")).toBe(true);
    expect(pc.addTransceiver("audio" as never)).toBe(pc.transceiver);
    expect(pc.addTrack).toHaveBeenCalledTimes(1);
    pc.close();
  });
  it("suppresses trickle and waits for gathering only in the gather-first variant", async () => {
    const { pc } = setup("gather-first");
    const callback = vi.fn(); pc.onicecandidate = callback;
    expect(pc.onicecandidate).toBeNull();
    const done = vi.fn();
    const pending = pc.setLocalDescription({ type: "offer", sdp: "m=video 9 UDP/TLS/RTP/SAVPF 96" }).then(done);
    await flush(); expect(done).not.toHaveBeenCalled();
    pc.iceGatheringState = "complete";
    pc.dispatchEvent(new Event("icegatheringstatechange"));
    await pending;
    expect(done).toHaveBeenCalledOnce();
    pc.close(); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds gathering and omits potentially sensitive native error messages", async () => {
    const { pc, entries } = setup("gather-first");
    const pending = pc.setLocalDescription({ type: "offer", sdp: "" });
    const rejected = expect(pending).rejects.toThrow("ICE gathering exceeded");
    await vi.advanceTimersByTimeAsync(20000); await rejected;
    expect(entries.find((entry) => entry.event === "setLocalDescription-error")?.detail).toEqual({ peer: 1, name: "Error" });
    pc.close();
  });
});
