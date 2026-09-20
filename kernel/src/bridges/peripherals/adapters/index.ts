import type { HostAdapter, PeripheralsService } from "../shared";
import { createGeolocationAdapter } from "./geolocation/host";
import { installGeolocationAdapter } from "./geolocation/child";

/** Register capabilities here; transport, scopes and lifecycle stay shared. */
export function createHostAdapters(): ReadonlyMap<string, HostAdapter> {
  return new Map([["geolocation", createGeolocationAdapter()]]);
}

export function installPeripheralAdapters(service: PeripheralsService) {
  installGeolocationAdapter(service);
}
