import type { ParentBridgeEndpointInstaller } from "../bridges/parent";
import { assertBridgedEventName } from "../bridges/events/shared";
import type { NavigableTransclude } from "../bridges/navigation/shared";
import type {
  DocumentResolver,
  ResolvedDocument,
} from "../bridges/resolution/shared";
import {
  composeAddress,
  composeQuery,
  parseAddress,
  parseQuery,
} from "../route";
import { ErrorPage, LoadingPage } from "../status-pages";
import { TranscludeFrame } from "./frame";

export interface TranscludeElement extends NavigableTransclude {
  /**
   * Receives child events after DOM dispatch, unless a bridge intercepted them
   * or a listener called preventDefault(). Listening alone does not consume an
   * event. Forwarding is opt-in: payloads remain untrusted when forwarded.
   */
  onUnhandledEvent?: (event: CustomEvent<unknown>) => void;
  /** Apply a relative navigation by reflecting it into `src` or `query`. */
  navigate(to: string): void;
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
   * - src: identifies the document to display, such as "my-cool-page" or
   *   "my-cool-page?/nested-query".
   * - srcdoc: directly supplies a document via its HTML source code when src
   *   is absent.
   * - query: is state passed to a direct srcdoc, such as
   *   "?mode=edit&section=2". It is ignored when src is present because src
   *   can include the whole query i.e. "my-coolpage?mode=edit"
   * - route: places this document in the containing document's public route.
   *   An absent route makes an independent side transclusion, an empty route
   *   preserves the containing route, `?/...` advances it relative to the
   *   containing document, and `#/...` identifies an absolute root route.
   * - autosize: controls the host's size; it accepts "off" (the default),
   *   "width", "height", or "both". A bare autosize attribute means "both".
   * - permission-scope: when set to "inherit", the containing document trusts
   *   this document to use its Graffiti permission scope instead of adding a
   *   new source segment.
   */
  class SocialWikiTransclude extends HTMLElement implements TranscludeElement {
    onUnhandledEvent?: TranscludeElement["onUnhandledEvent"];

    // Only attributes which require an immediate reaction are observed.
    static get observedAttributes() {
      return ["src", "srcdoc", "query", "route"];
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
      this.#syncRoute();
      void this.#render();
    }

    disconnectedCallback() {
      this.#renderVersion++;
      this.#resolutionRequest?.abort();
      this.#resolutionRequest = null;
      this.#frame.disconnect();
    }

    attributeChangedCallback(name: string) {
      if (name === "route") {
        this.#syncRoute();
        return;
      }
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
        // src selects the running document. While it is present, srcdoc is
        // neither an input nor an output of this element.
        return;
      } else {
        void this.#render();
      }
    }

    send(eventName: string, payload?: unknown) {
      assertBridgedEventName(eventName);
      this.#frame.send(eventName, payload);
    }

    navigate(to: string) {
      if (!to.startsWith("?")) {
        throw new TypeError(
          'Local transclusion navigation must start with "?"',
        );
      }

      const src = this.getAttribute("src");
      if (src !== null) {
        const sourceQuery = src.startsWith("?")
          ? src
          : composeQuery(undefined, src);
        const { params, address } = parseQuery(sourceQuery);
        if (address === undefined) return;
        const { name } = parseAddress(address);
        this.setAttribute(
          "src",
          composeQuery(params, composeAddress(name, to)),
        );
      } else if (this.hasAttribute("srcdoc")) {
        this.setAttribute("query", to);
      }
    }

    #syncRoute() {
      const route = this.getAttribute("route");
      this.#frame.setRoute(route === null ? undefined : route);
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
        });
        return;
      }

      // Keep the current iframe alive while resolving. If the resolver returns
      // the same srcdoc, TranscludeFrame can reuse the lens with its new query.
      this.#resolvedDocument = null;
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
        });
      } finally {
        if (this.#resolutionRequest === request) {
          this.#resolutionRequest = null;
        }
      }
    }

    #display(resolvedDocument: ResolvedDocument) {
      this.#resolvedDocument = resolvedDocument;
      this.#frame.render(resolvedDocument);
    }

    #receiveFrameEvent(event: CustomEvent<unknown>) {
      this.dispatchEvent(event);

      if (!event.defaultPrevented) this.onUnhandledEvent?.(event);
    }
  }

  customElements.define("sw-transclude", SocialWikiTransclude);
}
