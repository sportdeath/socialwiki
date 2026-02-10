import type { Graffiti } from "@graffiti-garden/api";
import { inputLensAddress, serveLens } from "./lens-server";
import { ErrorPage, LoadingPage } from "./status-pages";
import { serveNavigation } from "./navigation-server";

const lenses = {
  v: "src/lenses/view/index.html",
  e: "src/lenses/edit/index.html",
  h: "src/lenses/history/index.html",
  version: "src/lenses/version/index.html",
};
type Lens = keyof typeof lenses;
function assertLens(x: string): asserts x is Lens {
  if (!(x in lenses)) {
    throw new Error("Unrecognized lens");
  }
}

export function installTransclude(graffiti: Graffiti, origin: string) {
  class SocialWikiTransclude extends HTMLElement {
    protected iframe: HTMLIFrameElement;
    protected renderVersion = 0;
    protected destroyLens = () => {};
    protected destroyNavigation = () => {};
    protected setHash = (hash: string) => {};
    protected currentBlobUrl: string | null = null;

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
        "clipboard-read *",
        "clipboard-write *",
        "fullscreen *",
        "picture-in-picture *",
        "autoplay *",
        "screen-wake-lock *",
      ].join("; ");

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

      // The "lens" is everything before the first "/"
      // The "address" is everything after the first "/"
      const [lens, address] = route.split(/\/(.+)/).filter(Boolean);

      const token = ++this.renderVersion;

      if (this.currentLens === lens) {
        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        inputLensAddress(this.iframe, address);
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

        inputLensAddress(this.iframe, address);
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
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
      }
      const blob = new Blob([srcdoc], { type: "text/html" });
      this.currentBlobUrl = URL.createObjectURL(blob);
      this.setUrl(this.currentBlobUrl, status);
    }
    setUrl(url: string, status: string) {
      this.iframe.src = url;
      this.setAttribute("status", status);
    }

    // Rerender on initialization or src/srcdoc changes
    static get observedAttributes(): string[] {
      return ["src", "srcdoc", "hash"];
    }
    connectedCallback() {
      this.renderPage();
    }
    attributeChangedCallback() {
      this.renderPage();
    }
    adoptedCallback() {
      this.renderPage();
    }
  }

  customElements.define("sw-transclude", SocialWikiTransclude);
}
