import type { Graffiti } from "@graffiti-garden/api";
import { inputLensAddress, serveLens } from "./lens-server";
import { ErrorPage, LoadingPage } from "./status-pages";
import { serveNavigation } from "./navigation-server";
import { parseRoute } from "./route";
import { createTranscludeIdTracker } from "./transclude-ids";
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
  const transcludeIdTracker = createTranscludeIdTracker();

  class SocialWikiTransclude extends HTMLElement {
    protected iframe: HTMLIFrameElement;
    protected renderVersion = 0;
    protected destroyLens = () => {};
    protected destroyNavigation = () => {};
    protected setHash = (hash: string) => {};
    protected currentBlobUrl: string | null = null;
    // We intentionally use both srcdoc and blob URLs:
    // - Top-level, non-opaque contexts use blob URLs because Chrome can behave
    //   incorrectly with sandboxed srcdoc updates.
    // - Nested sandboxed contexts use srcdoc because Firefox blocks loading
    //   parent-created blob:null URLs across partition keys.
    protected readonly useBlobForSrcDoc =
      window.top === window && window.origin !== "null";

    constructor() {
      super();

      // Attach shadow DOM
      const shadow = this.attachShadow({ mode: "closed" });

      // Create iframe
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
      this.iframe.addEventListener("load", () =>
        transcludeIdTracker.syncIframeWindow(this),
      );

      this.destroyLens = serveLens(this.iframe, (status, srcdoc) => {
        this.setAttribute("status", status);
        if (srcdoc === undefined) {
          this.removeAttribute("srcdoc");
        } else {
          this.setAttribute("srcdoc", srcdoc);
        }
      });

      // Add styling
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

      const { destroy, setHash } = serveNavigation((to, top) => {
        const url = new URL(to, origin).toString();

        // Internal links are formatted with hash history
        const isInternal = url.startsWith(origin + "/#");

        // If we are not the top and either the link is external or top is set,
        // propagate the request to the root with another navigation
        if (window.top !== window && (!isInternal || top)) {
          window.navigate(to, true);
          return;
        }

        // Otherwise, if the link is still external, we must be
        // at the top. Simply set the src and watchers on
        // the src will take care of the rest.
        if (!isInternal) {
          this.setAttribute("src", to);
          return;
        }

        // Strip out the origin, leading slash and hash
        const route = url.slice(origin.length + 2);

        // If there is no current source to compute relative routes
        // against or the route is not relative, simply set the src,
        // again assuming watchers on the src will take care of the rest.
        const currentSrc = this.getAttribute("src");
        if (
          currentSrc == null ||
          !(route.startsWith("?") || route.startsWith("#"))
        ) {
          this.setAttribute("src", to);
          return;
        }

        const currentSrcUrl = new URL(
          this.getAttribute("src") || "",
          origin,
        ).toString();
        if (!currentSrcUrl.startsWith(origin + "/#/")) {
          throw new Error(`Current src is not a valid route: ${currentSrcUrl}`);
        }

        // Otherwise, the fragment or query is being changed,
        // which we treat as a relative navigation.
        const currentRoute = currentSrcUrl.slice(origin.length + 3);

        // Replace the fragment and query with the new ones if they exist
        const dummyRouteUrl = new URL(route, origin);
        const toUrl = new URL(currentRoute, origin);
        toUrl.hash = dummyRouteUrl.hash.length
          ? dummyRouteUrl.hash
          : toUrl.hash;
        toUrl.search = dummyRouteUrl.search.length
          ? dummyRouteUrl.search
          : toUrl.search;

        // Navigate to the new route
        this.setAttribute("src", "#" + toUrl.toString().slice(origin.length));
      }, this.iframe);

      this.destroyNavigation = destroy;
      this.setHash = setHash;
    }

    protected alive = true;
    disconnectedCallback() {
      this.alive = false;
      transcludeIdTracker.untrack(this);
      this.destroyLens();
      this.destroyNavigation();
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
      }
    }

    protected currentRoute = "";
    protected currentLens = "";
    protected lensReadyPromise: Promise<void> | null = null;
    protected srcDocReadyPromise: Promise<void> | null = null;
    async renderPage() {
      if (!this.alive) return;

      const src = this.getAttribute("src");
      if (src === null) {
        // srcdoc mode renders raw HTML directly in the iframe.
        // Reset lens/route state so returning to src mode reloads the lens page.
        this.currentRoute = "";
        this.currentLens = "";
        this.lensReadyPromise = null;

        // If no source, then a lens is using transclude
        // to manually set page contents. Just pay attention
        // to the srcdoc and the hash in this case.
        const srcdoc = this.getAttribute("srcdoc");
        if (srcdoc === null) {
          return this.setSrcDoc(LoadingPage, "loading");
        }

        const token = ++this.renderVersion;

        // If the doc is already set, just set the hash
        if (this.currentSrcDoc === srcdoc) {
          await this.srcDocReadyPromise;
          if (!this.alive || token !== this.renderVersion) return;
          this.setHash(this.getAttribute("hash") || "");
          return;
        }

        this.srcDocReadyPromise = new Promise((resolve) => {
          this.iframe.addEventListener("load", () => resolve(), { once: true });
        });

        this.setSrcDoc(srcdoc, "ok");

        await this.srcDocReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;

        this.setHash(this.getAttribute("hash") || "");
        return;
      }

      const url = new URL(src, origin).toString();
      if (!url.startsWith(origin + "/#/")) {
        return this.setSrcDoc(
          ErrorPage(`Could not extract page name from src: ${src}`),
          "error",
        );
      }
      const route = url.slice(origin.length + 3);
      if (this.currentRoute === route) return;
      this.currentRoute = route;

      const { lens, lensParams, pageAddress } = parseRoute(route);

      const token = ++this.renderVersion;

      if (this.currentLens === lens) {
        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        inputLensAddress(this.iframe, pageAddress, lensParams);
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

        inputLensAddress(this.iframe, pageAddress, lensParams);
      } catch (e) {
        if (!this.alive || token !== this.renderVersion) return;
        return this.setSrcDoc(
          ErrorPage(e instanceof Error ? e.message : String(e)),
          "error",
        );
      }
    }
    currentSrcDoc = "";
    setSrcDoc(srcdoc: string, status: string) {
      if (this.currentSrcDoc === srcdoc) return;
      this.currentSrcDoc = srcdoc;

      if (!this.useBlobForSrcDoc) {
        // In nested sandboxed frames (opaque/null origin), prefer srcdoc.
        // Firefox enforces storage partition keys for blob:null URLs and can
        // reject cross-partition blob access during nested transclusion.
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
          this.currentBlobUrl = null;
        }
        this.iframe.srcdoc = srcdoc;
        this.setAttribute("status", status);
        return;
      }

      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
      }
      // In top-level, non-opaque contexts, use blob URLs to avoid Chrome
      // sandbox/srcdoc rendering issues.
      const blob = new Blob([srcdoc], { type: "text/html" });
      this.currentBlobUrl = URL.createObjectURL(blob);
      this.setUrl(this.currentBlobUrl, status);
    }
    setUrl(url: string, status: string) {
      // If srcdoc is set, it wins over src; clear it before URL navigation.
      this.iframe.removeAttribute("srcdoc");
      this.iframe.src = url;
      this.setAttribute("status", status);
    }

    // Rerender on initialization or src/srcdoc changes
    static get observedAttributes(): string[] {
      return ["src", "srcdoc", "hash", "id"];
    }
    connectedCallback() {
      transcludeIdTracker.track(this, this.iframe);
      this.renderPage();
    }
    attributeChangedCallback(name: string) {
      if (name === "id") {
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
