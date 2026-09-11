import type { ParentBridgeEndpointInstaller } from "../bridges/parent";
import type { ResolvedDocument } from "../bridges/resolution/shared";
import { LoadingPage } from "../status-pages";

/** The state and resources tied to the current physical iframe. */
type DisplayedFrame = {
  iframe: HTMLIFrameElement;
  bridges: ReturnType<ParentBridgeEndpointInstaller>;
  blobUrl: string | null;
  srcdoc: string;
};

/**
 * Owns the iframe used by one <sw-transclude> element.
 *
 * The <sw-transclude> element (see ./element.ts) decides which document
 * should be displayed. This class handles the mechanics of displaying it:
 * - replace the iframe when the document changes;
 * - reuse the current iframe when only its query changes;
 * - show a loading page during replacement; and
 * - connect and destroy the iframe's bridges.
 */
export class TranscludeFrame {
  readonly #host: HTMLElement;
  readonly #installParentBridgeEndpoints: ParentBridgeEndpointInstaller;
  readonly #onEvent: (event: CustomEvent<unknown>) => void;
  readonly #shadow: ShadowRoot;
  readonly #loadingIframe = document.createElement("iframe");
  #displayedFrame: DisplayedFrame | null = null;

  constructor(
    host: HTMLElement,
    installParentBridgeEndpoints: ParentBridgeEndpointInstaller,
    onEvent: (event: CustomEvent<unknown>) => void,
  ) {
    this.#host = host;
    this.#installParentBridgeEndpoints = installParentBridgeEndpoints;
    this.#onEvent = onEvent;
    this.#shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      iframe { width: 100%; height: 100%; border: none; }
      :host { display: block; width: 100%; height: 100%; overflow: clip; }
    `;

    // Keep a status page visible while the next document loads instead of
    // showing stale content or about:blank.
    this.#loadingIframe.title = "Social.Wiki Loading";
    this.#loadingIframe.srcdoc = LoadingPage;
    this.#shadow.append(style, this.#loadingIframe);
  }

  disconnect() {
    this.showLoading();
  }

  /** Stops the current document and shows the loading page. */
  showLoading() {
    this.#disposeFrame();
    this.#loadingIframe.style.removeProperty("display");
  }

  render(next: ResolvedDocument) {
    // An address change can resolve to the same lens HTML with a new query.
    // Preserve that lens instance; only changed HTML requires a new iframe.
    if (this.#displayedFrame?.srcdoc === next.srcdoc) {
      this.#displayedFrame.bridges.setQuery(next.query);
      return;
    }

    this.#replaceFrame(next);
  }

  send(eventName: string, payload?: unknown) {
    this.#displayedFrame?.bridges.send(eventName, payload);
  }

  #replaceFrame(next: ResolvedDocument) {
    this.showLoading();

    const iframe = createIframe();
    iframe.style.display = "none";

    // Chrome behaves better with blob URLs for top-level sandboxed content.
    // Nested frames use srcdoc because Firefox can block parent-created
    // blob:null URLs across storage partitions.
    const useBlob = window.top === window && window.origin !== "null";
    const blobUrl = useBlob
      ? URL.createObjectURL(new Blob([next.srcdoc], { type: "text/html" }))
      : null;

    iframe.addEventListener(
      "load",
      () => {
        const displayedFrame = this.#displayedFrame;
        if (displayedFrame?.iframe !== iframe) return;

        iframe.style.removeProperty("display");
        this.#loadingIframe.style.display = "none";
      },
      { once: true },
    );

    // Set the source before appending so the first load is the target rather
    // than the initial about:blank document.
    if (blobUrl) iframe.src = blobUrl;
    else iframe.srcdoc = next.srcdoc;
    this.#shadow.append(iframe);

    const bridges = this.#installParentBridgeEndpoints(
      this.#host,
      iframe,
      this.#onEvent,
    );
    this.#displayedFrame = {
      iframe,
      bridges,
      blobUrl,
      srcdoc: next.srcdoc,
    };
    bridges.setQuery(next.query);
  }

  #disposeFrame() {
    if (!this.#displayedFrame) return;
    void this.#displayedFrame.bridges.destroy();
    this.#displayedFrame.iframe.remove();
    if (this.#displayedFrame.blobUrl) {
      URL.revokeObjectURL(this.#displayedFrame.blobUrl);
    }
    this.#displayedFrame = null;
  }
}

function createIframe() {
  const iframe = document.createElement("iframe");
  iframe.title = "Social.Wiki Frame";
  // Hidden replacement frames must be eager. Some browsers never load them
  // lazily, which would leave the loading page visible forever.
  iframe.loading = "eager";
  iframe.sandbox.add(
    // Lenses need these capabilities, but intentionally do not receive
    // allow-same-origin or unrestricted top-level navigation.
    "allow-scripts",
    "allow-modals",
    "allow-pointer-lock",
    "allow-downloads",
    // Permit user-initiated new tabs without letting them escape the sandbox.
    "allow-popups",
  );
  iframe.allow = [
    "camera *",
    "microphone *",
    "geolocation *",
    "fullscreen *",
    "clipboard-read *",
    "clipboard-write *",
  ].join("; ");
  return iframe;
}
