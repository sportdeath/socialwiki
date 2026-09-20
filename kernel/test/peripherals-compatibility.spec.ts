import { afterEach, expect, it, vi } from "vitest";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions } from "../src/bridges/peripherals/permissions";
import { createPermissionsAdapter } from "../src/bridges/peripherals/adapters/permissions/host";
import { createPermissionQuery } from "../src/bridges/peripherals/adapters/permissions/child";
import { createMediaAdapter } from "../src/bridges/peripherals/adapters/media/host";
import { installMediaAdapter } from "../src/bridges/peripherals/adapters/media/child";
import { createDeviceListing } from "../src/bridges/peripherals/adapters/media/devices";

const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
afterEach(() => window.dispatchEvent(new Event("pagehide")));
function permissionState(state: PermissionState) {
  const status = Object.assign(new EventTarget(), { state });
  return { status, native: { query: vi.fn(async () => status) } as unknown as Permissions,
    change(state: PermissionState) { status.state = state; status.dispatchEvent(new Event("change")); } };
}

it("exposes the effective site/browser permission and change events without prompting", async () => {
  const native = permissionState("granted");
  const ask = vi.fn(async () => ({ allow: true, remember: false }));
  const permissions = createPeripheralPermissions({ storage: null, ask });
  const service = createPeripheralsHost(new Map([["permissions", createPermissionsAdapter(native.native)]]), permissions);
  const query = createPermissionQuery(service);
  const status = await query({ name: "geolocation" });
  expect(status.state).toBe("prompt");
  expect(ask).not.toHaveBeenCalled();
  const listener = vi.fn(); const onchange = vi.fn();
  status.addEventListener("change", listener); status.onchange = onchange;
  const controller = new AbortController();
  await permissions.authorize([], [{ capability: "geolocation", label: "location" }], controller.signal, () => controller.abort());
  expect(status.state).toBe("granted");
  native.change("denied"); expect(status.state).toBe("denied");
  native.change("granted"); expect(status.state).toBe("granted");
  permissions.revoke({ source: [], capability: "geolocation" });
  expect(status.state).toBe("prompt");
  expect(listener).toHaveBeenCalledTimes(4); expect(onchange).toHaveBeenCalledTimes(4);
});

it("does not claim a permission was granted while the site prompt is pending", async () => {
  let allow!: (value: { allow: boolean; remember: boolean }) => void;
  const permissions = createPeripheralPermissions({ storage: null, ask: () => new Promise((resolve) => { allow = resolve; }) });
  const controller = new AbortController();
  const authorized = permissions.authorize([], [{ capability: "camera", label: "camera" }], controller.signal, () => controller.abort());
  await flush();
  expect(permissions.state({ source: [], capability: "camera" })).toBe("prompt");
  allow({ allow: false, remember: true }); await authorized;
  expect(permissions.state({ source: [], capability: "camera" })).toBe("denied");
  controller.abort();
});

function mediaDevices() {
  let devices = [
    { kind: "videoinput", label: "Webcam", deviceId: "camera-1", groupId: "group-1", getCapabilities: () => ({ width: { min: 1, max: 1920 } }) },
    { kind: "videoinput", label: "External camera", deviceId: "camera-2", groupId: "group-2" },
    { kind: "audioinput", label: "Microphone", deviceId: "mic-1", groupId: "group-1" },
  ];
  const native = Object.assign(new EventTarget(), {
    enumerateDevices: vi.fn(async () => devices),
    getSupportedConstraints: () => ({ width: true, deviceId: true }),
    getUserMedia: vi.fn(),
  });
  return { native: native as unknown as MediaDevices,
    unplug() { devices = devices.filter((device) => device.deviceId !== "camera-2"); native.dispatchEvent(new Event("devicechange")); } };
}

it("enumerates devices without leaking another scope's labels, IDs or capabilities", async () => {
  const devices = mediaDevices();
  const permissions = createPeripheralPermissions({ storage: null, ask: async () => ({ allow: true, remember: false }) });
  const service = createPeripheralsHost(new Map([["media", createMediaAdapter(devices.native)]]), permissions);
  const listing = createDeviceListing(service, new EventTarget());
  const other = new AbortController();
  await permissions.authorize([{ id: "other", name: "Other" }], [{ capability: "camera", label: "camera" }], other.signal, () => other.abort());
  const before = await listing.enumerateDevices();
  expect(before.map((device) => device.toJSON())).toEqual([
    { kind: "videoinput", label: "", deviceId: "", groupId: "" },
    { kind: "audioinput", label: "", deviceId: "", groupId: "" },
  ]);
  const current = new AbortController();
  await permissions.authorize([], [{ capability: "camera", label: "camera" }], current.signal, () => current.abort());
  const after = await listing.enumerateDevices();
  expect(after.filter((device) => device.kind === "videoinput").map((device) => device.deviceId)).toEqual(["camera-1", "camera-2"]);
  expect((after[0] as InputDeviceInfo).getCapabilities()).toEqual({ width: { min: 1, max: 1920 } });
  expect(after.find((device) => device.kind === "audioinput")!.label).toBe("");
  current.abort(); other.abort();
});

it("supports an ordinary device selector and devicechange listener", async () => {
  const devices = mediaDevices();
  const permissions = createPeripheralPermissions({ storage: null, ask: async () => ({ allow: true, remember: false }) });
  const service = createPeripheralsHost(new Map([["media", createMediaAdapter(devices.native)]]), permissions);
  const current = new AbortController();
  await permissions.authorize([], [{ capability: "camera", label: "camera" }], current.signal, () => current.abort());
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  installMediaAdapter(service);
  try {
    expect(navigator.mediaDevices.getSupportedConstraints()).toEqual({ width: true, deviceId: true });
    const changed = vi.fn(); navigator.mediaDevices.ondevicechange = changed;
    const inputs = await navigator.mediaDevices.enumerateDevices(); await flush();
    const selected = inputs.find((device) => device.kind === "videoinput")!;
    expect(selected.deviceId).toBe("camera-1");
    expect(changed).not.toHaveBeenCalled();
    devices.unplug(); await flush();
    expect(changed).toHaveBeenCalledTimes(1);
    expect((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput")).toHaveLength(1);
    permissions.revoke({ source: [], capability: "camera" }); await flush();
    expect(changed).toHaveBeenCalledTimes(2);
    expect((await navigator.mediaDevices.enumerateDevices())[0].label).toBe("");
    navigator.mediaDevices.ondevicechange = null;
  } finally {
    current.abort();
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else delete (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  }
});
