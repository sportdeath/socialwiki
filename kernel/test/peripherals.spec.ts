import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage as DOMStorage } from "happy-dom";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions, PERMISSION_STORAGE_KEY, type AskPermission } from "../src/bridges/peripherals/permissions";
import { createGeolocationAdapter } from "../src/bridges/peripherals/adapters/geolocation/host";
import { createGeolocationFacade } from "../src/bridges/peripherals/adapters/geolocation/child";
import { normalizeOptions } from "../src/bridges/peripherals/adapters/geolocation/shared";
import type { PeripheralRequest, PeripheralSink, PeripheralsService } from "../src/bridges/peripherals/shared";

const source = [{ id: "page-v1", name: "Map" }];
// Avoid Node 26's process-level localStorage when testing persisted browser grants.
const localStorage = new DOMStorage();
const request: PeripheralRequest = { source, capability: "geolocation", method: "watchPosition", args: [{}] };
const position = { timestamp: 1234, coords: { latitude: 42, longitude: -71, accuracy: 12,
  altitude: null, altitudeAccuracy: null, heading: null, speed: null } } as GeolocationPosition;
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function nativeLocation() {
  let success: PositionCallback;
  let error: PositionErrorCallback;
  const native = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => { success = s; error = e; return 7; }),
    clearWatch: vi.fn(),
  };
  return { native, fix: () => success(position), fail: (code: number) => error({ code, message: "Browser error" } as GeolocationPositionError) };
}
function setup(ask: AskPermission = async () => ({ allow: true, remember: false })) {
  const location = nativeLocation();
  const permissions = createPeripheralPermissions({ storage: null, ask });
  const service = createPeripheralsHost(new Map([["geolocation", createGeolocationAdapter(location.native)]]), permissions);
  return { ...location, permissions, service };
}

afterEach(() => { window.dispatchEvent(new Event("pagehide")); localStorage.clear(); });

describe("peripherals guard and geolocation adapter", () => {
  it("does not touch location until authorized; denial is terminal", async () => {
    let answer!: (value: { allow: boolean; remember: boolean }) => void;
    const s = setup(() => new Promise((resolve) => { answer = resolve; }));
    const update = vi.fn();
    s.service.start(request, update);
    await flush();
    expect(s.native.watchPosition).not.toHaveBeenCalled();
    answer({ allow: false, remember: false });
    await flush();
    expect(s.native.watchPosition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ type: "error", name: "NotAllowedError" }));
  });

  it("cancels a request while the permission prompt is pending", async () => {
    let answer!: (value: { allow: boolean; remember: boolean }) => void;
    const s = setup(() => new Promise((resolve) => { answer = resolve; }));
    const update = vi.fn();
    const { stop } = s.service.start(request, update);
    await flush(); stop();
    answer({ allow: true, remember: true });
    await flush();
    expect(s.native.watchPosition).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("forwards serializable positions and releases one-shots", async () => {
    const s = setup(); const update = vi.fn();
    s.service.start({ ...request, method: "getCurrentPosition" }, update);
    await flush(); s.fix(); s.fix();
    expect(update.mock.calls).toEqual([[{ type: "data", value: { position } }], [{ type: "end" }]]);
    expect(s.native.clearWatch).toHaveBeenCalledTimes(1);
    expect(s.native.clearWatch).toHaveBeenCalledWith(7);
  });

  it("keeps watches after timeouts, then stops on browser denial", async () => {
    const s = setup(); const update = vi.fn();
    s.service.start(request, update);
    await flush(); s.fail(3); s.fix();
    expect(s.native.clearWatch).not.toHaveBeenCalled();
    s.fail(1); s.fix();
    expect(update.mock.calls.map(([u]) => u.type)).toEqual(["data", "data", "data", "end"]);
    expect(s.native.clearWatch).toHaveBeenCalledTimes(1);
  });

  it("revokes active location independently of document cooperation", async () => {
    const s = setup(); const update = vi.fn();
    s.service.start(request, update);
    await flush(); s.fix(); s.permissions.revoke(request); s.fix();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.lastCall?.[0]).toMatchObject({ type: "error", name: "NotAllowedError" });
    expect(s.native.clearWatch).toHaveBeenCalledWith(7);
  });

  it("releases location on pagehide and rejects unknown operations before prompting", async () => {
    const ask = vi.fn(async () => ({ allow: true, remember: false }));
    const s = setup(ask);
    expect(() => s.service.start({ ...request, method: "anything" }, vi.fn())).toThrow();
    expect(ask).not.toHaveBeenCalled();
    s.service.start(request, vi.fn()); await flush();
    window.dispatchEvent(new Event("pagehide"));
    expect(s.native.clearWatch).toHaveBeenCalledWith(7);
  });
});

describe("standard geolocation facade", () => {
  function facade() {
    let emit!: PeripheralSink;
    const stop = vi.fn();
    const start = vi.fn<PeripheralsService["start"]>((_r, update) => { emit = update; return { stop }; });
    return { api: createGeolocationFacade({ start }), start, stop, emit: (v: Parameters<PeripheralSink>[0]) => emit(v) };
  }
  it("returns a synchronous watch ID, passes options and reconstructs position JSON", async () => {
    const s = facade(); const callback = vi.fn();
    const id = s.api.watchPosition(callback, null, { timeout: 100, enableHighAccuracy: true });
    expect(typeof id).toBe("number");
    expect(s.start.mock.calls[0][0]).toMatchObject({ capability: "geolocation", method: "watchPosition",
      args: [{ timeout: 100, maximumAge: 0, enableHighAccuracy: true }], source: [] });
    s.emit({ type: "data", value: { position } });
    expect(callback).not.toHaveBeenCalled();
    await flush();
    expect(callback.mock.calls[0][0].toJSON()).toEqual(position);
    s.api.clearWatch(id);
    expect(s.stop).toHaveBeenCalledTimes(1);
  });
  it("suppresses queued callbacks after clearWatch and ignores unknown IDs", async () => {
    const s = facade(); const callback = vi.fn();
    const id = s.api.watchPosition(callback);
    s.emit({ type: "data", value: { position } });
    s.api.clearWatch(id); s.api.clearWatch(id); s.api.clearWatch(999);
    await flush();
    expect(callback).not.toHaveBeenCalled();
    expect(s.stop).toHaveBeenCalledTimes(1);
  });
  it("getCurrentPosition returns undefined and delivers one result before end", async () => {
    const s = facade(); const callback = vi.fn();
    expect(s.api.getCurrentPosition(callback)).toBeUndefined();
    s.emit({ type: "data", value: { position } }); s.emit({ type: "end" });
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("maps guard denial to standard error fields and constants", async () => {
    const s = facade(); const error = vi.fn();
    s.api.getCurrentPosition(vi.fn(), error);
    s.emit({ type: "error", name: "NotAllowedError", message: "Denied" });
    await flush();
    expect(error.mock.calls[0][0]).toMatchObject({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  it("validates callbacks synchronously and leaves option ranges to the native API", () => {
    const s = facade();
    expect(() => s.api.getCurrentPosition(null as unknown as PositionCallback)).toThrow(TypeError);
    expect(s.start).not.toHaveBeenCalled();
    expect(normalizeOptions({ timeout: Infinity, maximumAge: -2 })).toEqual({ timeout: Infinity, maximumAge: -2, enableHighAccuracy: false });
  });
});

describe("shared peripheral grants", () => {
  const requirements = [{ capability: "geolocation", label: "location" }];
  it("keeps remembered decisions for the session if persistence fails", async () => {
    const storage = new DOMStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    const ask = vi.fn(async () => ({ allow: true, remember: true }));
    const permissions = createPeripheralPermissions({ storage, ask });
    const signal = new AbortController().signal;
    expect(await permissions.authorize(request.source, requirements, signal)).toBe(true);
    expect(await permissions.authorize(request.source, requirements, signal)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("does not retain access when saved decisions become invalid", async () => {
    const permissions = createPeripheralPermissions({ storage: localStorage,
      ask: async () => ({ allow: true, remember: true }) });
    const controller = new AbortController();
    const revoked = vi.fn(() => controller.abort());
    await permissions.authorize(request.source, requirements, controller.signal, revoked);
    localStorage.setItem(PERMISSION_STORAGE_KEY, "invalid JSON");
    window.dispatchEvent(new StorageEvent("storage", { key: PERMISSION_STORAGE_KEY }));
    expect(revoked).toHaveBeenCalledTimes(1);
  });
  it("remembers an explicit denial until the decision is forgotten", async () => {
    const ask = vi.fn(async () => ({ allow: false, remember: true }));
    const p = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    expect(await p.authorize(request.source, requirements, signal)).toBe(false);
    const restored = createPeripheralPermissions({ storage: localStorage, ask });
    expect(await restored.authorize(request.source, requirements, signal)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    restored.revoke(request);
    expect(await restored.authorize(request.source, requirements, signal)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it("remembers by capability and full ID path, not display names, across host instances", async () => {
    const ask = vi.fn(async () => ({ allow: true, remember: true }));
    const p = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    await p.authorize(request.source, requirements, signal);
    const restored = createPeripheralPermissions({ storage: localStorage, ask });
    await restored.authorize([{ id: "page-v1", name: "Renamed" }], requirements, signal);
    expect(ask).toHaveBeenCalledTimes(1);
    await restored.authorize([{ id: "page-v2", name: "Map" }], requirements, signal);
    await restored.authorize(source, [{ capability: "camera", label: "camera" }], signal);
    await restored.authorize([{ id: "other-parent", name: "Other" }, ...source], requirements, signal);
    expect(ask).toHaveBeenCalledTimes(4);
    expect(localStorage.getItem(PERMISSION_STORAGE_KEY)).not.toContain("latitude");
  });
  it("allow once is not persisted and revoked grants prompt again", async () => {
    const ask = vi.fn().mockResolvedValueOnce({ allow: true, remember: false }).mockResolvedValue({ allow: true, remember: true });
    const p = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    await p.authorize(request.source, requirements, signal);
    expect(localStorage.getItem(PERMISSION_STORAGE_KEY)).toBeNull();
    await p.authorize(request.source, requirements, signal);
    p.revoke(request);
    await p.authorize(request.source, requirements, signal);
    expect(ask).toHaveBeenCalledTimes(3);
  });
  it("clearing saved grants in another tab revokes active requests", async () => {
    const p = createPeripheralPermissions({ storage: localStorage, ask: async () => ({ allow: true, remember: true }) });
    const callback = vi.fn();
    const controller = new AbortController();
    await p.authorize(request.source, requirements, controller.signal, callback);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(callback).toHaveBeenCalledTimes(1);
    controller.abort();
  });
});

describe("combined peripheral grants", () => {
  const requirements = [{ capability: "camera", label: "camera" }, { capability: "microphone", label: "microphone" }];
  it.each([true, false])("remembers a combined answer independently for each device (allow=%s)", async (allow) => {
    const ask = vi.fn<AskPermission>(async () => ({ allow, remember: true }));
    const permissions = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    expect(await permissions.authorize(source, requirements, signal)).toBe(allow);
    for (const requirement of requirements) {
      expect(await permissions.authorize(source, [requirement], signal)).toBe(allow);
    }
    expect(ask).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(PERMISSION_STORAGE_KEY)!)).toEqual(
      requirements.map((permission) => ({ ...permission, source, allow })));
  });
  it("asks only for missing permissions and leaves the previously allowed device intact", async () => {
    const ask = vi.fn<AskPermission>().mockResolvedValueOnce({ allow: true, remember: true })
      .mockResolvedValue({ allow: false, remember: true });
    const permissions = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    await permissions.authorize(source, [requirements[0]], signal);
    expect(await permissions.authorize(source, requirements, signal)).toBe(false);
    expect(ask.mock.calls[1][1].map(({ capability }) => capability)).toEqual(["microphone"]);
    expect(await permissions.authorize(source, [requirements[0]], signal)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it("honors a remembered denial without prompting for the other device", async () => {
    const ask = vi.fn<AskPermission>(async () => ({ allow: false, remember: true }));
    const permissions = createPeripheralPermissions({ storage: localStorage, ask });
    const signal = new AbortController().signal;
    await permissions.authorize(source, [requirements[1]], signal);
    expect(await permissions.authorize(source, requirements, signal)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it.each(["camera", "microphone"])("revoking %s stops a combined request", async (capability) => {
    const permissions = createPeripheralPermissions({ storage: null,
      ask: async () => ({ allow: true, remember: false }) });
    const controller = new AbortController();
    const revoked = vi.fn(() => controller.abort());
    await permissions.authorize(source, requirements, controller.signal, revoked);
    permissions.revoke({ source, capability });
    expect(revoked).toHaveBeenCalledTimes(1);
    permissions.revoke({ source, capability });
    expect(revoked).toHaveBeenCalledTimes(1);
  });
});
