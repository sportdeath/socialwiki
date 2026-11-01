import type { BridgedServices } from "./shared";
import { installAutosizeChild } from "./autosize/child";
import { installEventsChild } from "./events/child";
import { installDocumentMetadataChild } from "./document-metadata/child";
import { installGraffitiChild } from "./graffiti/child";
import { installHistoryChild } from "./history/child";
import { installNavigationChild } from "./navigation/child";
import { installResolutionChild } from "./resolution/child";
import { installPeripheralsChild } from "./peripherals/child";
import { consumeFrameData } from "./bootstrap";
import { installGuardIdentity } from "./graffiti/identity";

/** Install the child half of every capability provided over an iframe boundary. */
export function installChildBridgeEndpoints() : BridgedServices {
  const guardPath = installGuardIdentity(consumeFrameData("guardPath"));
  const events = installEventsChild();
  installDocumentMetadataChild(events);
  const createGraffiti = installGraffitiChild();
  const resolve = installResolutionChild(events);
  const documentRoute = installNavigationChild(events);
  installHistoryChild(events, documentRoute);
  const autosize = installAutosizeChild(events);
  const peripherals = installPeripheralsChild();
  return { guardPath, createGraffiti, resolve, documentRoute, peripherals, autosize };
}
