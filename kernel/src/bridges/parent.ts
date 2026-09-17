import type { BridgedServices } from "./shared";
import { installAutosizeParent } from "./autosize/parent";
import { installEventsParent } from "./events/parent";
import { installGraffitiParent } from "./graffiti/parent";
import { installNavigationParent } from "./navigation/parent";
import { installResolutionParent } from "./resolution/parent";

/** Create an installer that can be used to connect this document to a transcluded iframe */
export function createParentBridgeEndpointInstaller(
  bridgedServices: BridgedServices,
) {
  const { resolve, createGraffiti, documentRoute } = bridgedServices;
  return (
    host: HTMLElement,
    iframe: HTMLIFrameElement,
    onEvent: (event: CustomEvent<unknown>) => void,
  ) => {
    const events = installEventsParent(iframe, onEvent);
    const navigationBridge = installNavigationParent(events, documentRoute);
    const autosize = installAutosizeParent(iframe, host, events);
    const resolution = installResolutionParent(events, resolve);
    const graffitiBridge = installGraffitiParent(iframe, host, createGraffiti());

    return {
      destroy() {
        navigationBridge.destroy();
        autosize.destroy();
        resolution.destroy();
        events.destroy();
        void graffitiBridge.destroy();
      },
      send: events.send,
      setQuery: navigationBridge.setQuery,
    };
  };
}

export type ParentBridgeEndpointInstaller = ReturnType<
  typeof createParentBridgeEndpointInstaller
>;
