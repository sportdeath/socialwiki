import type { BridgedServices } from "./shared";
import { installAutosizeParent } from "./autosize/parent";
import { installEventsParent } from "./events/parent";
import { installGraffitiParent } from "./graffiti/parent";
import { installNavigationParent } from "./navigation/parent";
import type { NavigableTransclude } from "./navigation/shared";
import { installResolutionParent } from "./resolution/parent";

/** Create an installer that can be used to connect this document to a transcluded iframe */
export function createParentBridgeEndpointInstaller(
  bridgedServices: BridgedServices,
) {
  const { resolve, createGraffiti, documentRoute } = bridgedServices;
  return (
    host: NavigableTransclude,
    iframe: HTMLIFrameElement,
    onEvent: (event: CustomEvent<unknown>) => void,
  ) => {
    const events = installEventsParent(iframe, onEvent);
    const navigationBridge = installNavigationParent(
      host,
      events,
      documentRoute,
    );
    const autosize = installAutosizeParent(host, events);
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
      setRoute: navigationBridge.setRoute,
      setQuery: navigationBridge.setQuery,
    };
  };
}

export type ParentBridgeEndpointInstaller = ReturnType<
  typeof createParentBridgeEndpointInstaller
>;
