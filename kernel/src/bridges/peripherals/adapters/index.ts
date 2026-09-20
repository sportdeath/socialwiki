import type { HostAdapter, PeripheralsService } from "../shared";
import { createGeolocationAdapter } from "./geolocation/host";
import { installGeolocationAdapter } from "./geolocation/child";

import { createMediaAdapter } from "./media/host";
import { installMediaAdapter } from "./media/child";

/** Register capabilities here; transport, scopes and lifecycle stay shared. */
export function createHostAdapters(): ReadonlyMap<string, HostAdapter> {
  return new Map([["geolocation", createGeolocationAdapter()], ["media", createMediaAdapter()]]);
}

export function installPeripheralAdapters(service: PeripheralsService) {
  installGeolocationAdapter(service);
  installMediaAdapter(service);
}
