import type { Graffiti } from "@graffiti-garden/api";
import { ErrorPage, LoadingPage } from "./status-pages";
import { parseRoute } from "./route";
import { createTranscludeIdTracker } from "./transclude-ids";
import {
  ensureSocialWikiIo,
  HostTranscludeIo,
  isInputAttributeName,
  type SwScope,
} from "./transclude-io";
export { getTranscludeId } from "./transclude-ids";

const lenses = {
  v: "src/lenses/view/index.html",
  e: "src/lenses/edit/index.html",
  h: "src/lenses/history/index.html",
};
type Lens = keyof typeof lenses;
function assertLens(x: string): asserts x is Lens {
  if (!(x in lenses)) {
    throw new Error("Unrecognized lens");
  }
}

export function installTransclude(graffiti: Graffiti, origin: string) {
  void graffiti;
  ensureSocialWikiIo();

  const transcludeIdTracker = createTranscludeIdTracker();

  class SocialWikiTransclude extends HTMLElement {
    protected iframe: HTMLIFrameElement;
    protected renderVersion = 0;
    protected currentBlobUrl: string | null = null;
    protected io: HostTranscludeIo;
    protected inputObserver: MutationObserver;
    protected currentRoute = "";
    protected currentLens = "";
    protected lensReadyPromise: Promise<void> | null = null;
    protected srcDocReadyPromise: Promise<void> | null = null;
    protected alive = true;

    // We intentionally use both srcdoc and blob URLs:
    // - Top-level, non-opaque contexts use blob URLs because Chrome can behave
    //   incorrectly with sandboxed srcdoc updates.
    // - Nested sandboxed contexts use srcdoc because Firefox blocks loading
    //   parent-created blob:null URLs across partition keys.
    protected readonly useBlobForSrcDoc =
      window.top === window && window.origin !== "null";

    constructor() {
      super();

      const shadow = this.attachShadow({ mode: "closed" });
      this.iframe = document.createElement("iframe");
      this.iframe.title = "Social.Wiki Transclude";
      this.iframe.loading = "lazy";
      this.iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-modals",
        "allow-pointer-lock",
        "allow-downloads",
      );
      this.iframe.allow = [
        "camera *",
        "microphone *",
        "geolocation *",
        "fullscreen *",
        "clipboard-read *",
        "clipboard-write *",
      ].join("; ");

      this.io = new HostTranscludeIo(this, this.iframe, ({ scope, name, payload }) => {
        const type =
          scope === "lens" ? `sw:lens-event:${name}` : `sw:event:${name}`;
        this.dispatchEvent(
          new CustomEvent(type, {
            detail: payload,
            bubbles: true,
            composed: true,
          }),
        );

        if (typeof payload !== "string") {
          return;
        }
        if (name === "navigate") {
          this.handleNavigate(payload);
        } else if (name === "navigate-top") {
          this.handleNavigate(payload, true);
        }
      });

      this.iframe.addEventListener("load", () => {
        transcludeIdTracker.syncIframeWindow(this);
        this.io.reconnect();
      });

      this.inputObserver = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type !== "attributes") continue;
          const name = record.attributeName;
          if (!name || !isInputAttributeName(name)) continue;
          this.io.refreshAttributeInputs();
          return;
        }
      });

      const style = document.createElement("style");
      style.textContent = `
        iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
        :host {
          display: block;
          width: 100%;
          height: 100%;
          overflow: clip;
        }
      `;

      shadow.append(style, this.iframe);
    }

    send(name: string, payload?: string, scope: SwScope = "page") {
      this.io.send(name, payload, scope);
    }

    protected handleNavigate(to: string, top?: boolean) {
      const url = new URL(to, origin).toString();

      // Internal links are formatted with hash history.
      const isInternal = url.startsWith(origin + "/#");

      // If we are not the top and either the link is external or top is set,
      // propagate the request to the root with another navigation.
      if (window.top !== window && (!isInternal || top)) {
        window.navigate(to, true);
        return;
      }

      // Otherwise, if the link is still external, we must be at the top.
      if (!isInternal) {
        this.setAttribute("src", to);
        return;
      }

      // Strip out the origin, leading slash and hash.
      const route = url.slice(origin.length + 2);

      // If there is no current source to compute relative routes against
      // or the route is not relative, simply set the src.
      const currentSrc = this.getAttribute("src");
      if (currentSrc == null || !(route.startsWith("?") || route.startsWith("#"))) {
        this.setAttribute("src", to);
        return;
      }

      const currentSrcUrl = new URL(currentSrc, origin).toString();
      if (!currentSrcUrl.startsWith(origin + "/#/")) {
        throw new Error(`Current src is not a valid route: ${currentSrcUrl}`);
      }

      // Otherwise, the fragment or query is being changed.
      const currentRoute = currentSrcUrl.slice(origin.length + 3);

      const dummyRouteUrl = new URL(route, origin);
      const toUrl = new URL(currentRoute, origin);
      toUrl.hash = dummyRouteUrl.hash.length ? dummyRouteUrl.hash : toUrl.hash;
      toUrl.search = dummyRouteUrl.search.length
        ? dummyRouteUrl.search
        : toUrl.search;

      this.setAttribute("src", "#" + toUrl.toString().slice(origin.length));
    }

    disconnectedCallback() {
      this.alive = false;
      this.inputObserver.disconnect();
      transcludeIdTracker.untrack(this);
      this.io.destroy();
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
      }
    }

    async renderPage() {
      if (!this.alive) return;

      const src = this.getAttribute("src");
      if (src === null) {
        this.currentRoute = "";
        this.currentLens = "";
        this.lensReadyPromise = null;

        const srcdoc = this.getAttribute("srcdoc");
        if (srcdoc === null) {
          this.io.clearRouteInputs();
          return this.setSrcDoc(LoadingPage, "loading");
        }

        this.io.clearRouteInputs();

        const token = ++this.renderVersion;

        if (this.currentSrcDoc === srcdoc) {
          await this.srcDocReadyPromise;
          if (!this.alive || token !== this.renderVersion) return;
          return;
        }

        this.srcDocReadyPromise = new Promise((resolve) => {
          this.iframe.addEventListener("load", () => resolve(), { once: true });
        });

        this.setSrcDoc(srcdoc, "ok");

        await this.srcDocReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        return;
      }

      const url = new URL(src, origin).toString();
      if (!url.startsWith(origin + "/#/")) {
        this.io.clearRouteInputs();
        return this.setSrcDoc(
          ErrorPage(`Could not extract page name from src: ${src}`),
          "error",
        );
      }
      const route = url.slice(origin.length + 3);
      if (this.currentRoute === route) return;
      this.currentRoute = route;

      const parsedRoute = parseRoute(route);
      const lens = parsedRoute.lens;

      const lensInputs = new Map<string, string>();
      if (parsedRoute.pageAddress.length) {
        lensInputs.set("name", parsedRoute.pageName);
      }
      for (const [key, value] of parsedRoute.lensParams) {
        lensInputs.set(key, value);
      }

      const pageInputs = new Map<string, string>();
      for (const [key, value] of parsedRoute.pageArgs) {
        pageInputs.set(key, value);
      }
      if (parsedRoute.pageHash.length) {
        pageInputs.set("hash", parsedRoute.pageHash);
      }

      const token = ++this.renderVersion;

      if (this.currentLens === lens) {
        this.io.setRouteInputs(pageInputs, lensInputs);
        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        return;
      }
      this.currentLens = lens;

      this.setSrcDoc(LoadingPage, "loading");

      try {
        assertLens(lens);
        const lensSource = lenses[lens];

        this.lensReadyPromise = (async () => {
          this.setUrl(`${origin}/${lensSource}`, "loading");
          await new Promise((resolve) => {
            this.iframe.addEventListener("load", resolve, { once: true });
          });
        })();

        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;

        this.io.setRouteInputs(pageInputs, lensInputs);
      } catch (e) {
        if (!this.alive || token !== this.renderVersion) return;
        this.io.clearRouteInputs();
        return this.setSrcDoc(
          ErrorPage(e instanceof Error ? e.message : String(e)),
          "error",
        );
      }
    }

    currentSrcDoc = "";
    setSrcDoc(srcdoc: string, status: string) {
      void status;
      if (this.currentSrcDoc === srcdoc) return;
      this.currentSrcDoc = srcdoc;

      if (!this.useBlobForSrcDoc) {
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
          this.currentBlobUrl = null;
        }
        this.iframe.srcdoc = srcdoc;
        return;
      }

      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
      }
      const blob = new Blob([srcdoc], { type: "text/html" });
      this.currentBlobUrl = URL.createObjectURL(blob);
      this.setUrl(this.currentBlobUrl, status);
    }

    setUrl(url: string, status: string) {
      void status;
      this.iframe.removeAttribute("srcdoc");
      this.iframe.src = url;
    }

    static get observedAttributes(): string[] {
      return ["src", "srcdoc", "id", "name"];
    }

    connectedCallback() {
      transcludeIdTracker.track(this, this.iframe);
      this.inputObserver.observe(this, { attributes: true });
      this.io.refreshAttributeInputs();
      this.renderPage();
    }

    attributeChangedCallback(name: string) {
      if (name === "id" || name === "name") {
        transcludeIdTracker.notifyIdChanged(this);
        return;
      }
      this.renderPage();
    }

    adoptedCallback() {
      transcludeIdTracker.syncIframeWindow(this);
      this.renderPage();
    }
  }

  customElements.define("sw-transclude", SocialWikiTransclude);
}

declare global {
  interface HTMLElementTagNameMap {
    "sw-transclude": HTMLElement & {
      send(name: string, payload?: string, scope?: SwScope): void;
    };
  }
}
