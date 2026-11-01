import type { Graffiti } from "@graffiti-garden/api";
import { createGraffitiRelay, serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { withGuardSource } from "@graffiti-garden/wrapper-data-guard";
import { sourceFromElement } from "../source";

/** The kernel supplies the child's identity; the guard owns its interpretation. */
export function withTranscludeSource(graffiti: Graffiti, element: HTMLElement) {
  return withGuardSource(graffiti, () =>
    element.getAttribute("permission-scope") === "inherit" ? undefined : sourceFromElement(element));
}

/** Install this realm's Graffiti connection across one iframe boundary. */
export function installGraffitiParent(
  iframe: HTMLIFrameElement,
  element: HTMLElement,
  graffiti: Graffiti,
) {
  const remoteWindow = iframe.contentWindow;
  if (!remoteWindow) {
    throw new Error("Transclude iframe did not create a content window");
  }

  const relay = createGraffitiRelay(graffiti, sourceFromElement(element).id);
  const scoped = withTranscludeSource(relay.graffiti, element);
  const rpcHost = serveGraffiti(scoped.graffiti);
  const connection = rpcHost.connect({ remoteWindow, stateId: relay.stateId });
  return {
    async destroy() {
      scoped.destroy();
      relay.destroy();
      await connection.destroy();
      await rpcHost.destroy();
    },
  };
}
