import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMediaAdapter } from "../src/bridges/peripherals/adapters/media/host";
import { createGetUserMedia } from "../src/bridges/peripherals/adapters/media/child";
import { createMediaPeer } from "../src/bridges/peripherals/adapters/media/peer";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions, type AskPermission } from "../src/bridges/peripherals/permissions";
import type { PeripheralRequest } from "../src/bridges/peripherals/shared";

// These fakes exercise signaling order and resource ownership, not browser codecs/ICE.
class Track extends EventTarget {
  readyState = "live";
  muted = false;
  enabled = true;
  label = "Test device";
  constraints: MediaTrackConstraints = {};
  settings = { width: 640 };
  constructor(public kind: string) { super(); }
  stop() { this.readyState = "ended"; }
  clone() { const track = new Track(this.kind); track.readyState = this.readyState; return track; }
  getSettings() { return this.settings; }
  getConstraints() { return this.constraints; }
  getCapabilities() { return { width: { min: 1, max: 1920 } }; }
  async applyConstraints(constraints: MediaTrackConstraints = {}) {
    if (constraints.width === 9999) {
      throw Object.assign(new DOMException("Unsupported width", "OverconstrainedError"), { constraint: "width" });
    }
    this.constraints = constraints;
    if (typeof constraints.width === "number") this.settings = { width: constraints.width };
  }
}
class Stream {
  constructor(private tracks: Track[] = []) {}
  getTracks() { return [...this.tracks]; }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  addTrack(track: Track) { this.tracks.push(track); }
  clone() { return new Stream(this.tracks.map((track) => track.clone())); }
}
class Peer extends EventTarget {
  static peers: Peer[] = [];
  static connect = true;
  id = Peer.peers.length;
  tracks: Track[] = [];
  localDescription: (RTCSessionDescriptionInit & { toJSON(): RTCSessionDescriptionInit }) | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState = "new";
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { track: Track }) => void) | null = null;
  candidates: unknown[] = [];
  constructor(public configuration: RTCConfiguration) { super(); Peer.peers.push(this); }
  addTransceiver(track: Track) { this.tracks.push(track); }
  async createOffer() { return { type: "offer" as const, sdp: String(this.id) }; }
  async createAnswer() { return { type: "answer" as const, sdp: String(this.id) }; }
  async setLocalDescription(value: RTCSessionDescriptionInit) {
    this.localDescription = { ...value, toJSON: () => value };
    // Exercise a candidate arriving before the SDP description.
    this.onicecandidate?.({ candidate: null });
  }
  async setRemoteDescription(value: RTCSessionDescriptionInit) {
    this.remoteDescription = value;
    const other = Peer.peers[Number(value.sdp)];
    if (value.type === "offer") {
      other.tracks.forEach((track) => this.ontrack?.({ track: new Track(track.kind) }));
    } else if (Peer.connect) {
      for (const peer of [this, other]) {
        peer.connectionState = "connected";
        peer.onconnectionstatechange?.();
        peer.dispatchEvent(new Event("connectionstatechange"));
      }
    }
  }
  async addIceCandidate(candidate: unknown) {
    if (!this.remoteDescription) throw new Error("Candidate before remote description");
    this.candidates.push(candidate);
  }
  close() { this.connectionState = "closed"; }
}
const request: PeripheralRequest = { source: [{ id: "call", name: "Call" }], capability: "media", method: "getUserMedia", args: [{ audio: true, video: true }] };
function setup(ask: AskPermission = async () => ({ allow: true, remember: false })) {
  const tracks: Track[] = [];
  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    const captured = ["audio", "video"].filter((kind) => constraints[kind as "audio" | "video"])
      .map((kind) => new Track(kind));
    tracks.push(...captured);
    return new Stream(captured) as unknown as MediaStream;
  });
  const permissions = createPeripheralPermissions({ storage: null, ask });
  const service = createPeripheralsHost(new Map([["media", createMediaAdapter({ getUserMedia } as unknown as MediaDevices)]]), permissions);
  return { tracks, getUserMedia, permissions, service, capture: createGetUserMedia(service) };
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
beforeAll(() => {
  vi.stubGlobal("MediaStreamTrack", Track);
  vi.stubGlobal("MediaStream", Stream);
  vi.stubGlobal("RTCPeerConnection", Peer);
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  Peer.peers = []; Peer.connect = true;
  vi.useRealTimers();
});
afterAll(() => vi.unstubAllGlobals());

describe("guarded camera and microphone", () => {
  it("authorizes both devices before making one native capture request", async () => {
    const ask = vi.fn<AskPermission>(async () => ({ allow: true, remember: false }));
    const s = setup(ask);
    const stream = await s.capture({ video: { width: 640 }, audio: true });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][1].map(({ capability }) => capability)).toEqual(["camera", "microphone"]);
    expect(s.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true, video: { width: 640 } });
    expect(stream).toBeInstanceOf(Stream);
    expect(stream.getTracks()).toHaveLength(2);
    expect(Peer.peers).toHaveLength(2);
    expect(Peer.peers.every((peer) => peer.configuration.iceServers?.length === 0)).toBe(true);
    expect(Peer.peers.every((peer) => peer.candidates.length === 1)).toBe(true);
  });
  it("does not open either device when one permission is denied", async () => {
    const s = setup(async (_source, permissions) => ({ allow: !permissions.some(({ capability }) => capability === "camera"), remember: false }));
    await expect(s.capture({ audio: true, video: true })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(s.getUserMedia).not.toHaveBeenCalled();
  });
  it("does not prompt for omitted devices and validates empty requests", async () => {
    const ask = vi.fn<AskPermission>(async () => ({ allow: true, remember: false }));
    const s = setup(ask);
    await expect(s.capture({})).rejects.toBeInstanceOf(TypeError);
    expect(ask).not.toHaveBeenCalled();
    const stream = await s.capture({ video: true });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][1][0].capability).toBe("camera");
    expect(stream.getAudioTracks()).toHaveLength(0);
  });
  it("preserves native error names and overconstrained details", async () => {
    const s = setup();
    s.getUserMedia.mockRejectedValueOnce(Object.assign(new DOMException("Too wide", "OverconstrainedError"), { constraint: "width" }));
    await expect(s.capture({ video: true })).rejects.toMatchObject({ name: "OverconstrainedError", constraint: "width" });
    expect(Peer.peers).toHaveLength(0);
  });
  it("releases a native result that arrives after cancellation", async () => {
    const s = setup();
    let resolve!: (stream: MediaStream) => void;
    s.getUserMedia.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const update = vi.fn();
    const session = s.service.start(request, update);
    await flush();
    session.stop();
    const track = new Track("video");
    resolve(new Stream([track]) as unknown as MediaStream);
    await flush();
    expect(track.readyState).toBe("ended");
    expect(update).not.toHaveBeenCalled();
    expect(Peer.peers).toHaveLength(0);
  });
  it("stopping camera leaves microphone running, then stops the whole session", async () => {
    const s = setup();
    const stream = await s.capture({ video: true, audio: true });
    stream.getVideoTracks()[0].stop();
    await flush();
    expect(s.tracks.find((track) => track.kind === "video")!.readyState).toBe("ended");
    expect(s.tracks.find((track) => track.kind === "audio")!.readyState).toBe("live");
    expect(Peer.peers.every((peer) => peer.connectionState === "connected")).toBe(true);
    stream.getAudioTracks()[0].stop();
    await flush();
    expect(Peer.peers.every((peer) => peer.connectionState === "closed")).toBe(true);
  });
  it("keeps capture until the last clone stops, including a newly constructed stream's clones", async () => {
    const s = setup();
    const stream = await s.capture({ video: true });
    const original = stream.getVideoTracks()[0];
    const clone = original.clone();
    const copied = new MediaStream([original]).clone().getVideoTracks()[0];
    original.stop(); clone.stop();
    await flush();
    expect(s.tracks[0].readyState).toBe("live");
    copied.stop();
    await flush();
    expect(s.tracks[0].readyState).toBe("ended");
  });
  it("revocation closes the host peer and ends all receiving clones", async () => {
    const s = setup();
    const stream = await s.capture({ audio: true, video: true });
    const clone = stream.clone();
    const ended = vi.fn();
    clone.getVideoTracks()[0].addEventListener("ended", ended);
    s.permissions.revoke({ source: [], capability: "camera" });
    await flush();
    expect(s.tracks.every((track) => track.readyState === "ended")).toBe(true);
    expect([...stream.getTracks(), ...clone.getTracks()].every((track) => track.readyState === "ended")).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(Peer.peers.every((peer) => peer.connectionState === "closed")).toBe(true);
  });
  it("forwards device constraints and returns host settings without exposing mutable cache", async () => {
    const s = setup();
    const [track] = (await s.capture({ video: true })).getVideoTracks();
    await track.applyConstraints({ width: 320 });
    expect(s.tracks[0].constraints).toEqual({ width: 320 });
    expect(track.getSettings().width).toBe(320);
    expect(track.getConstraints()).toEqual({ width: 320 });
    expect(track.getCapabilities().width).toEqual({ min: 1, max: 1920 });
    const settings = track.getSettings(); settings.width = 12;
    expect(track.getSettings().width).toBe(320);
    await expect(track.applyConstraints({ width: 9999 })).rejects.toMatchObject({ name: "OverconstrainedError", constraint: "width" });
    expect(track.readyState).toBe("live");
  });
  it("leaves unrelated native tracks and streams alone", async () => {
    const s = setup(); await s.capture({ video: true }); // Install the narrow hooks.
    const track = new Track("video") as unknown as MediaStreamTrack;
    await track.applyConstraints({ width: 123 });
    expect(track.getSettings().width).toBe(123);
    const clone = new MediaStream([track]).clone();
    track.stop();
    expect(clone.getTracks()[0].readyState).toBe("live");
    expect(s.tracks[0].readyState).toBe("live");
  });
  it("ends receiving tracks when the native device ends", async () => {
    const s = setup();
    const [track] = (await s.capture({ video: true })).getVideoTracks();
    const ended = vi.fn(); track.addEventListener("ended", ended);
    s.tracks[0].stop(); s.tracks[0].dispatchEvent(new Event("ended"));
    await flush();
    expect(track.readyState).toBe("ended");
    expect(ended).toHaveBeenCalledTimes(1);
  });
  it("releases capture and rejects pending getUserMedia when the page hides", async () => {
    const s = setup();
    let answer!: (answer: { allow: boolean; remember: boolean }) => void;
    const pending = setup(() => new Promise((r) => { answer = r; }));
    const stream = await s.capture({ video: true });
    const capture = pending.capture({ audio: true });
    const rejected = expect(capture).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    window.dispatchEvent(new Event("pagehide"));
    answer({ allow: true, remember: false });
    await rejected;
    expect(stream.getTracks()[0].readyState).toBe("ended");
    expect(s.tracks[0].readyState).toBe("ended");
    expect(pending.getUserMedia).not.toHaveBeenCalled();
  });
  it("fails boundedly when WebRTC never connects and releases devices", async () => {
    vi.useFakeTimers(); Peer.connect = false;
    const s = setup();
    const capture = s.capture({ video: true });
    const rejected = expect(capture).rejects.toMatchObject({ name: "NotReadableError" });
    await flush();
    await vi.advanceTimersByTimeAsync(30001);
    await rejected;
    expect(s.tracks[0].readyState).toBe("ended");
    expect(Peer.peers.every((peer) => peer.connectionState === "closed")).toBe(true);
  });
  it("rejects control messages before authorization and after stop", async () => {
    const s = setup();
    const session = s.service.start(request, vi.fn());
    await expect(session.send!({ type: "candidate", candidate: null })).rejects.toThrow("unavailable");
    await flush(); session.stop();
    await expect(session.send!({ type: "stopTrack", kind: "video" })).rejects.toThrow("unavailable");
  });
  it("queues candidates until the remote description and closes failed connections", async () => {
    const fail = vi.fn();
    const peer = createMediaPeer(async () => {}, fail);
    await peer.receive({ type: "candidate", candidate: null });
    expect(Peer.peers[0].candidates).toHaveLength(0);
    await peer.receive({ type: "description", description: { type: "offer", sdp: "0" } });
    expect(Peer.peers[0].candidates).toHaveLength(1);
    Peer.peers[0].connectionState = "failed";
    Peer.peers[0].onconnectionstatechange?.();
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ name: "NotReadableError" }));
    peer.close();
  });
});
