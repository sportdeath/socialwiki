import { expect, it } from "vitest";
import { preparePeripheralsFrame, readPeripheralFeatures } from "../src/bridges/peripherals/features";
import { installFileSystemAdapter } from "../src/bridges/peripherals/adapters/filesystem/child";
import { createFileSystemAdapter } from "../src/bridges/peripherals/adapters/filesystem/host";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions } from "../src/bridges/peripherals/permissions";

it("makes feature metadata available synchronously, and consumes the bootstrap name", () => {
  const frame = document.createElement("iframe");
  const features = { filePickers: ["showOpenFilePicker"], media: { width: true } };
  preparePeripheralsFrame(frame, features);
  window.name = frame.name;
  expect(readPeripheralFeatures()).toEqual(features);
  expect(window.name).toBe("");
  expect(readPeripheralFeatures()).toEqual({});
});

it("preserves ordinary feature detection on browsers with no native pickers", () => {
  const service = createPeripheralsHost(new Map([["file-system", createFileSystemAdapter({})]]),
    createPeripheralPermissions({ storage: null, ask: async () => ({ allow: true, remember: false }) }));
  installFileSystemAdapter(service);
  expect("showOpenFilePicker" in window).toBe(false);
  expect("showSaveFilePicker" in window).toBe(false);
  expect("showDirectoryPicker" in window).toBe(false);
  window.dispatchEvent(new Event("pagehide"));
});
