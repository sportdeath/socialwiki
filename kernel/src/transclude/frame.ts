import type { ParentBridgeEndpointInstaller } from "../bridges/parent";
import type { NavigableTransclude } from "../bridges/navigation/shared";
import type { ResolvedDocument } from "../bridges/resolution/shared";
import { LoadingPage, ErrorPage } from "../status-pages";

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
  readonly #host: NavigableTransclude;
  readonly #installParentBridgeEndpoints: ParentBridgeEndpointInstaller;
  readonly #onEvent: (event: CustomEvent<unknown>) => void;
  readonly #runtimeUrl: string;
  readonly #shadow: ShadowRoot;
  readonly #loadingIframe = document.createElement("iframe");
  #displayedFrame: DisplayedFrame | null = null;
  #route: string | undefined;
  #generation = 0;

  constructor(
    host: NavigableTransclude,
    installParentBridgeEndpoints: ParentBridgeEndpointInstaller,
    onEvent: (event: CustomEvent<unknown>) => void,
    runtimeUrl: string,
  ) {
    this.#host = host;
    this.#installParentBridgeEndpoints = installParentBridgeEndpoints;
    this.#onEvent = onEvent;
    this.#runtimeUrl = runtimeUrl;
    // Expose nested frames to browser testing and inspection tools. The iframe
    // sandbox, not the shadow root, isolates each document's live DOM.
    this.#shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; }
      :host {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        min-height: 150px;
        overflow: clip;
      }
    `;

    // Keep a status page visible while the next document loads instead of
    // showing stale content or about:blank.
    this.#loadingIframe.title = "Social.Wiki Loading";
    this.#loadingIframe.srcdoc = LoadingPage;
    this.#loadingIframe.style.zIndex = "1";
    this.#shadow.append(style, this.#loadingIframe);
  }

  disconnect() {
    this.showLoading();
  }

  /** Stops the current document and shows the loading page. */
  showLoading() {
    this.#generation++;
    this.#disposeFrame();
    if (this.#loadingIframe.srcdoc !== LoadingPage) this.#loadingIframe.srcdoc = LoadingPage;
    this.#loadingIframe.style.removeProperty("visibility");
  }

  render(next: ResolvedDocument) {
    // An address change can resolve to the same lens HTML with a new query.
    // Preserve that lens instance; only changed HTML requires a new iframe.
    if (this.#displayedFrame?.srcdoc === next.srcdoc) {
      this.#displayedFrame.bridges.setQuery(next.query);
      return;
    }

    void this.#replaceFrame(next);
  }

  setRoute(route?: string) {
    this.#route = route;
    this.#displayedFrame?.bridges.setRoute(route);
  }

  send(eventName: string, payload?: unknown) {
    this.#displayedFrame?.bridges.send(eventName, payload);
  }

  async #replaceFrame(next: ResolvedDocument) {
    this.showLoading();

    const iframe = createIframe();
    const generation = this.#generation;
    try {
      const preparation = this.#installParentBridgeEndpoints.prepareFrame?.(iframe, this.#host);
      // Bridges may need bootstrap data before the child's scripts execute.
      if (preparation) await preparation;
    } catch (error) {
      if (generation === this.#generation) this.#loadingIframe.srcdoc = ErrorPage(String(error));
      return;
    }
    if (generation !== this.#generation) return;

    // Run embedded documents with the same kernel as their containing document.
    // Keep the resolved source intact for reuse and lens output.
    const srcdoc = next.srcdoc.replaceAll(
      "https://social.wiki/init.js",
      this.#runtimeUrl,
    );

    // WebKit needs a blob URL at the top level to avoid deeply nested srcdoc
    // frames. Other browsers can use srcdoc, including embedded previews that
    // cannot load sandboxed blob frames.
    const useBlob = window.top === window && window.origin !== "null" &&
      isWebKit(navigator.userAgent);
    const blobUrl = useBlob
      ? URL.createObjectURL(new Blob([srcdoc], { type: "text/html" }))
      : null;
    // Safari before version 27 rejects deeply nested about:srcdoc documents
    // as prohibited self-references (WebKit bug 305276). Once a nested frame
    // uses a sandboxed data URL, keep its descendants on data URLs as well.
    // Only WebKit needs this fallback. Its data: frames are not secure contexts,
    // so APIs such as crypto.subtle and crypto.randomUUID are unavailable there.
    // https://bugs.webkit.org/show_bug.cgi?id=305276
    // https://github.com/whatwg/html/issues/12091
    const dataUrl = useDataUrlForNestedFrame(window.location.href, navigator.userAgent)
      ? `data:text/html;charset=utf-8,${encodeURIComponent(srcdoc)}`
      : null;

    iframe.addEventListener(
      "load",
      () => {
        const displayedFrame = this.#displayedFrame;
        if (displayedFrame?.iframe !== iframe) return;

        // Keep the reusable status document laid out so Safari does not
        // reconstruct it later with a stale or zero-width viewport.
        this.#loadingIframe.style.visibility = "hidden";
      },
      { once: true },
    );

    // Set the source before appending so the first load is the target rather
    // than the initial about:blank document.
    if (blobUrl) iframe.src = blobUrl;
    else if (dataUrl) iframe.src = dataUrl;
    else iframe.srcdoc = srcdoc;
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
    bridges.setRoute(this.#route);
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

export function useDataUrlForNestedFrame(parentUrl: string, userAgent: string): boolean {
  return /^(about:srcdoc|data:)/.test(parentUrl) &&
    isWebKit(userAgent);
}

function isWebKit(userAgent: string): boolean {
  // Chromium's UA also contains AppleWebKit. CriOS/EdgiOS on iOS use WebKit.
  return /AppleWebKit\//.test(userAgent) &&
    !/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent);
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
    "allow-forms",
    // Permit user-initiated new tabs without letting them escape the sandbox.
    "allow-popups",
  );
  iframe.allow = [
    "fullscreen *",
    "clipboard-read *",
    "clipboard-write *",
  ].join("; ");
  return iframe;
}
