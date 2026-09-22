import type { ParentBridgeEndpointInstaller } from "../bridges/parent";
import type { DocumentResolver } from "../bridges/resolution/shared";
import { defineTranscludeElement } from "./element";

export function installTransclude(
  resolve: DocumentResolver,
  installParentBridgeEndpoints: ParentBridgeEndpointInstaller,
) {
  if (customElements.get("sw-transclude")) return;
  defineTranscludeElement(resolve, installParentBridgeEndpoints);
}
