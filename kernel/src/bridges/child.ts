import type { BridgedServices } from "./shared";
import { installAutosizeChild } from "./autosize/child";
import { installEventsChild } from "./events/child";
import { installGraffitiChild } from "./graffiti/child";
import { installNavigationChild } from "./navigation/child";
import { installResolutionChild } from "./resolution/child";

/** Install the child half of every capability provided over an iframe boundary. */
export function installChildBridgeEndpoints() : BridgedServices {
  const events = installEventsChild();
  const graffiti = installGraffitiChild();
  const resolve = installResolutionChild(events);
  installNavigationChild(events);
  installAutosizeChild(events);
  return { graffiti, resolve };
}
