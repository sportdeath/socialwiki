import type { ParentBridgeEndpointInstaller } from "../bridges/parent";
import type {
  DocumentResolver,
  ResolvedDocument,
} from "../bridges/resolution/shared";
import { ErrorPage, LoadingPage } from "../status-pages";
import { TranscludeFrame } from "./frame";

export interface TranscludeElement extends HTMLElement {
  /**
   * Receives child events after DOM dispatch, unless a bridge intercepted them
   * or a listener called preventDefault(). Listening alone does not consume an
   * event. Forwarding is opt-in: payloads remain untrusted when forwarded.
   */
  onUnhandledEvent?: (event: CustomEvent<unknown>) => void;
  send(eventName: string, payload?: unknown): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "sw-transclude": TranscludeElement;
  }
}

export function defineTranscludeElement(
  resolve: DocumentResolver,
  installParentBridgeEndpoints: ParentBridgeEndpointInstaller,
) {
  /**
   * Displays a document inside a sandboxed iframe.
   *
   * Attributes:
   * - src: identifies the document to display, such as "#/v?/my-cool-page".
   * - srcdoc: directly supplies a document via its HTML source code. When src
   *   is present, it may be an output of what is displayed rather than an
   *   input to the transclude.
   * - query: is state passed to a direct srcdoc, such as
   *   "?mode=edit&section=2". It is ignored when src is present because src
   *   contains its own query.
   * - autosize: controls the host's size; it accepts "off" (the default),
   *   "width", "height", or "both". A bare autosize attribute means "both".
   * - ignore-lens-output: lets lens output events bubble without copying their
   *   status and HTML onto this element.
   * - status: reports the current result; it is an output, not an input.
   */
  class SocialWikiTransclude extends HTMLElement implements TranscludeElement {
    onUnhandledEvent?: TranscludeElement["onUnhandledEvent"];

    // Only attributes which require an immediate reaction are observed.
    // ignore-lens-output is checked when an output event arrives, while status
    // is only written by this element.
    static get observedAttributes() {
      return ["src", "srcdoc", "query"];
    }

    // The frame is where the document is actually rendered using an iframe.
    // This outer layer does the work of parsing the attributes and deciding
    // what the iframe should display.
    readonly #frame: TranscludeFrame;
    // The resolved document is either what is passed into srcdoc or
    // what is fetched and resolved from src using the document resolver.
    #resolvedDocument: ResolvedDocument | null = null;
    #renderVersion = 0;
    #resolutionRequest: AbortController | null = null;

    constructor() {
      super();
      this.#frame = new TranscludeFrame(
        this,
        installParentBridgeEndpoints,
        // Route events from the iframe back to this element
        (event) => this.#receiveFrameEvent(event),
      );
    }

    connectedCallback() {
      void this.#render();
    }

    disconnectedCallback() {
      this.#renderVersion++;
      this.#resolutionRequest?.abort();
      this.#resolutionRequest = null;
      this.#frame.disconnect();
    }

    attributeChangedCallback(name: string) {
      // Attribute callbacks also run on detached elements. connectedCallback
      // will render the latest values once this element is in the document.
      if (!this.isConnected) return;

      if (name === "query") {
        // query only belongs to a directly supplied document.
        if (!this.hasAttribute("srcdoc") || this.hasAttribute("src")) return;
        if (this.#resolvedDocument) {
          // A query changes state inside the current document;
          // it does not need to re-resolve the document or replace the iframe.
          this.#frame.render({
            ...this.#resolvedDocument,
            query: this.getAttribute("query") ?? "",
          });
        }
      } else if (name === "srcdoc" && this.hasAttribute("src")) {
        // src selects the running lens. While it is present, srcdoc is an
        // output reflected by that lens, not a replacement for the lens.
        return;
      } else {
        void this.#render();
      }
    }

    send(eventName: string, payload?: unknown) {
      this.#frame.send(eventName, payload);
    }

    async #render() {
      // isConnected is a built-in Node property maintained by the DOM.
      if (!this.isConnected) return;

      // Maintain a render version so that async operations that complete
      // after a newer render is requested are ignored.
      const version = ++this.#renderVersion;
      this.#resolutionRequest?.abort();
      this.#resolutionRequest = null;

      const src = this.getAttribute("src");
      if (src === null) {
        const srcdoc = this.getAttribute("srcdoc");
        this.#display({
          srcdoc: srcdoc ?? LoadingPage,
          query: srcdoc === null ? "" : (this.getAttribute("query") ?? ""),
          status: srcdoc === null ? "loading" : "ok",
        });
        return;
      }

      // Keep the current iframe alive while resolving. If the resolver returns
      // the same srcdoc, TranscludeFrame can reuse the lens with its new query.
      this.#resolvedDocument = null;
      this.setAttribute("status", "loading");
      const request = new AbortController();
      this.#resolutionRequest = request;
      try {
        const resolvedDocument = await resolve(src, request.signal);
        if (!this.isConnected || version !== this.#renderVersion) return;
        this.#display(resolvedDocument);
      } catch (error) {
        if (!this.isConnected || version !== this.#renderVersion) return;
        this.#display({
          srcdoc: ErrorPage(
            error instanceof Error ? error.message : String(error),
          ),
          query: "",
          status: "error",
        });
      } finally {
        if (this.#resolutionRequest === request) {
          this.#resolutionRequest = null;
        }
      }
    }

    #display(resolvedDocument: ResolvedDocument) {
      this.#resolvedDocument = resolvedDocument;
      this.setAttribute("status", resolvedDocument.status);
      this.#frame.render(resolvedDocument);
    }

    #receiveFrameEvent(event: CustomEvent<unknown>) {
      if (event.type === "sw-lens-output") this.#acceptLensOutput(event.detail);

      this.dispatchEvent(event);

      // Wait for containing-document handlers (e.g. navigation) before offering
      // the event to a transparent lens's forwarding callback.
      if (!event.defaultPrevented) this.onUnhandledEvent?.(event);
    }

    #acceptLensOutput(output: unknown) {
      // The iframe may be running a lens which produces another HTML document.
      // The lens reports that result to its containing transclude, for example:
      //
      // window.emit("sw-lens-output", {
      //   status: "ok",
      //   srcdoc: "<article>Hello</article>",
      // });
      //
      // By default, the srcdoc is copied onto this element. This lets a containing
      // application observe the status and resulting HTML as attributes. However, some
      // hosts own their srcdoc, so ignore-lens-output leaves the attributes
      // unchanged - this is the typical behavior of most "lenses".
      // The event still bubbles from #receiveFrameEvent either way.
      if (this.hasAttribute("ignore-lens-output")) return;

      // This value arrived from another window, so check its shape before use.
      if (typeof output !== "object" || output === null) return;
      const { status, srcdoc } = output as Record<string, unknown>;
      if (
        typeof status !== "string" ||
        (srcdoc !== undefined && typeof srcdoc !== "string")
      ) {
        return;
      }

      this.setAttribute("status", status);
      // A lens may report a status such as "not-found" without HTML. Remove
      // any previous output so it is not mistaken for the current result.
      if (srcdoc === undefined) this.removeAttribute("srcdoc");
      else this.setAttribute("srcdoc", srcdoc);
    }
  }

  customElements.define("sw-transclude", SocialWikiTransclude);
}
