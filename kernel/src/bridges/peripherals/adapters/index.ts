import type { HostAdapter, PeripheralsService } from "../shared";
import { createGeolocationAdapter } from "./geolocation/host";
import { installGeolocationAdapter } from "./geolocation/child";

import { createMediaAdapter } from "./media/host";
import { installMediaAdapter } from "./media/child";

import { createFileSystemAdapter } from "./filesystem/host";
import { installFileSystemAdapter } from "./filesystem/child";

import { createPermissionsAdapter } from "./permissions/host";
import { installPermissionsAdapter } from "./permissions/child";

/** Register capabilities here; transport, scopes and lifecycle stay shared. */
export function createHostAdapters(): ReadonlyMap<string, HostAdapter> {
  return new Map([
    ["geolocation", createGeolocationAdapter()],
    ["permissions", createPermissionsAdapter()],
    ["media", createMediaAdapter()],
    ["file-system", createFileSystemAdapter()],
  ]);
}

export function installPeripheralAdapters(service: PeripheralsService) {
  installPermissionsAdapter(service);
  if (service.features.geolocation) installGeolocationAdapter(service);
  installMediaAdapter(service);
  installFileSystemAdapter(service);
}
