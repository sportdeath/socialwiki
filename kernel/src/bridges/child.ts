import type { BridgedServices } from "./shared";
import { installAutosizeChild } from "./autosize/child";
import { installEventsChild } from "./events/child";
import { installGraffitiChild } from "./graffiti/child";
import { installNavigationChild } from "./navigation/child";
import { installResolutionChild } from "./resolution/child";
import { installPeripheralsChild } from "./peripherals/child";

/** Install the child half of every capability provided over an iframe boundary. */
export function installChildBridgeEndpoints() : BridgedServices {
  const events = installEventsChild();
  const createGraffiti = installGraffitiChild();
  const resolve = installResolutionChild(events);
  const documentRoute = installNavigationChild(events);
  installAutosizeChild(events);
  const peripherals = installPeripheralsChild();
  return { createGraffiti, resolve, documentRoute, peripherals };
}
