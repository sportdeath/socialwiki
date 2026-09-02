import type { Graffiti } from "@graffiti-garden/api";
import {
  parseAutosizeMode,
  serveAutosize,
} from "../bridges/autosize/host";
import { serveEvents } from "../bridges/events/host";
import { serveGraffitiToIframe } from "../bridges/graffiti/host";
import type { ResolvedDocument } from "../bridges/browser-resolver/shared";
import { LoadingPage } from "../status-pages";

/** The state and resources tied to the current physical iframe. */
type DisplayedFrame = {
  iframe: HTMLIFrameElement;
  bridges: ReturnType<typeof connectIframeBridges>;
  blobUrl: string | null;
  key: string;
  srcdoc: string;
  query: string;
};

/**
 * Owns the iframe used by one <sw-transclude> element.
 *
 * The <sw-transclude> element (see ./element.ts) decides which document
 * should be displayed. This class handles the mechanics of displaying it:
 * - replace the iframe when the document changes;
 * - reuse the current iframe when only its query changes;
 * - show a loading page during replacement; and
 * - connect and destroy the iframe's Graffiti, event, and autosize bridges.
 */
export class TranscludeFrame {
  readonly #host: HTMLElement;
  readonly #graffiti: Graffiti;
  readonly #onEvent: (name: string, detail: unknown) => void;
  readonly #shadow: ShadowRoot;
  readonly #loadingIframe = document.createElement("iframe");
  #displayedFrame: DisplayedFrame | null = null;

  constructor(
    host: HTMLElement,
    graffiti: Graffiti,
    onEvent: (name: string, detail: unknown) => void,
  ) {
    this.#host = host;
    this.#graffiti = graffiti;
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

  autosizeChanged() {
    this.#displayedFrame?.bridges.setAutosizeMode(
      parseAutosizeMode(this.#host.getAttribute("autosize")),
    );
  }

  render(next: ResolvedDocument) {
    // The key and HTML identify the document,
    // while the query is state within it.
    if (
      this.#displayedFrame?.key === next.key &&
      this.#displayedFrame.srcdoc === next.srcdoc
    ) {
      this.#displayedFrame.query = next.query;
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
        // Messages sent before the child installed its kernel may have been
        // missed, so resend the state once its document has loaded.
        displayedFrame.bridges.syncAutosizeMode();
        displayedFrame.bridges.setQuery(displayedFrame.query);
      },
      { once: true },
    );

    // Set the source before appending so the first load is the target rather
    // than the initial about:blank document.
    if (blobUrl) iframe.src = blobUrl;
    else iframe.srcdoc = next.srcdoc;
    this.#shadow.append(iframe);

    const bridges = connectIframeBridges(
      this.#graffiti,
      this.#host,
      iframe,
      this.#onEvent,
    );
    this.#displayedFrame = {
      iframe,
      bridges,
      blobUrl,
      key: next.key,
      srcdoc: next.srcdoc,
      query: next.query,
    };
    bridges.setAutosizeMode(
      parseAutosizeMode(this.#host.getAttribute("autosize")),
    );
  }

  #disposeFrame() {
    if (!this.#displayedFrame) return;
    this.#displayedFrame.bridges.destroy();
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
    "allow-forms",
    "allow-modals",
    "allow-pointer-lock",
    "allow-downloads",
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

function connectIframeBridges(
  graffiti: Graffiti,
  host: HTMLElement,
  iframe: HTMLIFrameElement,
  onEvent: (eventName: string, payload: unknown) => void,
) {
  // The bridge implementations are independent modules. They are connected
  // together here because they all live and die with this particular iframe.
  const destroyGraffiti = serveGraffitiToIframe(graffiti, host, iframe);
  const events = serveEvents(onEvent, iframe);
  const autosize = serveAutosize(host, iframe);

  return {
    destroy: () => {
      events.destroy();
      autosize.destroy();
      void destroyGraffiti();
    },
    send: events.send,
    setQuery: (query: string) => events.send("sw-query", { query }),
    setAutosizeMode: autosize.setMode,
    syncAutosizeMode: autosize.syncMode,
  };
}
