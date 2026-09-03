import type { BridgedServices } from "./shared";
import { installAutosizeParent } from "./autosize/parent";
import { installEventsParent } from "./events/parent";
import { installGraffitiParent } from "./graffiti/parent";
import { installNavigationParent } from "./navigation/parent";
import { installResolutionParent } from "./resolution/parent";


/** Create an installer that can be used to connect this document to a transcluded iframe */
export function createParentBridgeEndpointInstaller(bridgedServices: BridgedServices) {
  const { resolve, graffiti, baseUrl } = bridgedServices;
  return (
    host: HTMLElement,
    iframe: HTMLIFrameElement,
    onEvent: (eventName: string, payload: unknown) => void,
  ) => {
    const events = installEventsParent(iframe);
    const stopForwardingEvents = events.listen(onEvent);
    const navigation = installNavigationParent(iframe, events, baseUrl);
    const autosize = installAutosizeParent(iframe, host, events);
    const resolution = installResolutionParent(events, resolve);
    const graffitiBridge = installGraffitiParent(iframe, host, graffiti);

    return {
      destroy() {
        stopForwardingEvents();
        navigation.destroy();
        autosize.destroy();
        resolution.destroy();
        events.destroy();
        void graffitiBridge.destroy();
      },
      send: events.send,
      setQuery: navigation.setQuery,
    };
  };
}

export type ParentBridgeEndpointInstaller = ReturnType<
  typeof createParentBridgeEndpointInstaller
>;
