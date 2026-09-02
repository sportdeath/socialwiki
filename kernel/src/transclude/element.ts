import type { Graffiti } from "@graffiti-garden/api";
import { resolveWithBrowser } from "../bridges/browser-resolver/client";
import type { ResolvedDocument } from "../bridges/browser-resolver/shared";
import { ErrorPage, LoadingPage } from "../status-pages";
import { TranscludeFrame } from "./frame";

export function defineTranscludeElement(graffiti: Graffiti) {
  /**
   * Displays a document inside a sandboxed iframe.
   *
   * Attributes:
   * - src: identifies the document to display, such as "#/v?/my-cool-page".
   * - srcdoc: directly supplies a document via its HTML source code. When src
   *   is present, it may be an output of what is displayed rather than an
   *   input to the transclude.
   * - query: is state passed to the document, such as "?mode=edit&section=2".
   * - autosize: controls the host's size; it accepts "off" (the default),
   *   "width", "height", or "both". A bare autosize attribute means "both".
   * - ignore-lens-output: lets lens output events bubble without copying their
   *   status and HTML onto this element.
   * - status: reports the current result; it is an output, not an input.
   */
  class SocialWikiTransclude extends HTMLElement {
    // Only attributes which require an immediate reaction are observed.
    // ignore-lens-output is checked when an output event arrives, while status
    // is only written by this element.
    static get observedAttributes() {
      return ["src", "srcdoc", "query", "autosize"];
    }

    // The frame is where the document is actually rendered using an iframe.
    // This outer layer does the work of parsing the attributes and deciding
    // what the iframe should display.
    readonly #frame: TranscludeFrame;
    // The resolved document is either what is passed into srcdoc or
    // what is fetched and resolved from src using `resolveWithBrowser`.
    #resolvedDocument: ResolvedDocument | null = null;
    #renderVersion = 0;

    constructor() {
      super();
      this.#frame = new TranscludeFrame(
        this,
        graffiti,
        // Route events from the iframe back to this element
        (name, detail) => this.#receiveFrameEvent(name, detail),
      );
    }

    connectedCallback() {
      void this.#render();
    }

    disconnectedCallback() {
      this.#renderVersion++;
      this.#frame.disconnect();
    }

    attributeChangedCallback(name: string) {
      // Attribute callbacks also run on detached elements. connectedCallback
      // will render the latest values once this element is in the document.
      if (!this.isConnected) return;

      if (name === "autosize") {
        this.#frame.autosizeChanged();
      } else if (name === "query" && this.#resolvedDocument) {
        // A query changes state inside the current document;
        // it does not need to re-resolve the document or replace the iframe.
        const query =
          this.getAttribute("query") ?? this.#resolvedDocument.query;
        this.#frame.render({
          ...this.#resolvedDocument,
          query,
        });
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

      const src = this.getAttribute("src");
      if (src === null) {
        const srcdoc = this.getAttribute("srcdoc");
        this.#display({
          key: `srcdoc:${srcdoc ?? ""}`,
          srcdoc: srcdoc ?? LoadingPage,
          query: this.getAttribute("query") ?? "",
          status: srcdoc === null ? "loading" : "ok",
        });
        return;
      }

      this.setAttribute("status", "loading");
      try {
        // Let the top-level document (the "browser") interpret src.
        const resolvedDocument = await resolveWithBrowser(src);
        if (!this.isConnected || version !== this.#renderVersion) return;
        this.#display(resolvedDocument);
      } catch (error) {
        if (!this.isConnected || version !== this.#renderVersion) return;
        this.#display({
          key: `error:${src}`,
          srcdoc: ErrorPage(
            error instanceof Error ? error.message : String(error),
          ),
          query: "",
          status: "error",
        });
      }
    }

    #display(resolvedDocument: ResolvedDocument) {
      this.#resolvedDocument = resolvedDocument;
      const query = this.getAttribute("query") ?? resolvedDocument.query;
      this.setAttribute("status", resolvedDocument.status);
      this.#frame.render({
        ...resolvedDocument,
        query,
      });
    }

    #receiveFrameEvent(name: string, detail: unknown) {
      if (name === "sw-navigate") this.#navigate(detail);
      if (name === "sw-lens-output") this.#acceptLensOutput(detail);

      this.dispatchEvent(
        new CustomEvent(name, { detail, bubbles: true, composed: true }),
      );
    }

    #navigate(detail: unknown) {
      if (typeof detail !== "object" || detail === null) return;
      const to = (detail as Record<string, unknown>).to;
      if (typeof to !== "string") return;

      // Query-only navigation changes this frame. Everything else continues
      // toward the top-level browser.
      if (to.startsWith("?")) this.setAttribute("query", to);
      else if (window.top !== window) window.navigate(to);
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
