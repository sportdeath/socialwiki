import type { Graffiti } from "@graffiti-garden/api";
import { ErrorPage, LoadingPage } from "./status-pages";
import { serveEvents } from "./events-server";
import { serveNavigation } from "./navigation-server";
import {
  parseQuery,
  parseAddress,
  composeQuery,
  composeAddress,
} from "./route";
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
    protected readonly origin: string;
    protected readonly transcludeIdTracker: ReturnType<
      typeof createTranscludeIdTracker
    >;
    protected readonly shadowRootContainer: ShadowRoot;
    protected iframe: HTMLIFrameElement;
    protected displayedIframe: HTMLIFrameElement;
    protected pendingSwapFromIframe: HTMLIFrameElement | null = null;
    protected pendingSwapTarget: HTMLIFrameElement | null = null;
    protected renderVersion = 0;
    protected destroyEvents = () => {};
    protected destroyNavigation = () => {};
    protected sendEvent = (_eventName: string, _payload?: unknown) => {};
    protected setQuery = (_query: string) => {};
    protected currentBlobUrl: string | null = null;
    protected readonly loadingPageBlobUrl: string | null;
    protected currentFrameSourceKey = "";

    // We intentionally use both srcdoc and blob URLs:
    // - Top-level, non-opaque contexts use blob URLs because Chrome can behave
    //   incorrectly with sandboxed srcdoc updates.
    // - Nested sandboxed contexts use srcdoc because Firefox blocks loading
    //   parent-created blob:null URLs across partition keys.
    protected readonly useBlobForSrcDoc =
      window.top === window && window.origin !== "null";

    constructor() {
      super();
      this.origin = origin;
      this.transcludeIdTracker = transcludeIdTracker;
      this.shadowRootContainer = this.attachShadow({ mode: "closed" });
      this.loadingPageBlobUrl = this.useBlobForSrcDoc
        ? URL.createObjectURL(new Blob([LoadingPage], { type: "text/html" }))
        : null;

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
      this.iframe = this.createIframeElement();
      this.displayedIframe = this.iframe;
      this.shadowRootContainer.append(style, this.iframe);
      this.attachIframeServices();
    }

    protected createIframeElement() {
      const iframe = document.createElement("iframe");
      iframe.title = "Social.Wiki Transclude";
      iframe.loading = "lazy";
      iframe.sandbox.add(
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
      iframe.addEventListener("load", () =>
        this.transcludeIdTracker.syncIframeWindow(this),
      );
      return iframe;
    }

    protected attachIframeServices() {
      this.destroyEvents();
      this.destroyNavigation();

      const { destroy: destroyEvents, send } = serveEvents(
        (eventName, payload) => {
          this.dispatchEvent(
            new CustomEvent(eventName, {
              detail: payload,
              bubbles: true,
              composed: true,
            }),
          );

          if (eventName !== "sw-lens-output") return;
          if (typeof payload !== "object" || payload === null) return;
          const p = payload as Record<string, unknown>;
          if (
            typeof p.status !== "string" ||
            (typeof p.srcdoc !== "string" && p.srcdoc !== undefined)
          )
            return;

          this.setAttribute("status", p.status);
          if (p.srcdoc === undefined) {
            this.removeAttribute("srcdoc");
            return;
          }
          this.setAttribute("srcdoc", p.srcdoc);
        },
        this.iframe,
      );

      const { destroy, setQuery } = serveNavigation((to) => {
        // If the navigation is not relative, don't do anything.
        // The host will get the message and handle it if needed
        if (!to.startsWith("?")) return;

        // If there is no source, just replace the query
        const currentSrc = this.getAttribute("src");
        if (currentSrc === null) {
          this.setAttribute("query", to);
          return;
        }

        // Otherwise, parse the query from the source
        const currentSrcUrl = new URL(currentSrc || "", this.origin).toString();
        if (!currentSrcUrl.startsWith(this.origin + "/#/")) {
          throw new Error(`Current src is not a valid route: ${currentSrcUrl}`);
        }
        const currentRoute = currentSrcUrl.slice(this.origin.length + 3);

        // Then inject the relative query
        const { name } = parseAddress(currentRoute);
        const newSrc = `#/${composeAddress(name, to)}`;
        this.setAttribute("src", newSrc);
      }, this.iframe);

      this.destroyEvents = destroyEvents;
      this.destroyNavigation = destroy;
      this.sendEvent = send;
      this.setQuery = setQuery;
    }

    protected replaceIframeForSourceChange(sourceKey: string) {
      if (this.currentFrameSourceKey === sourceKey) return;

      const hadFrame = this.currentFrameSourceKey.length > 0;
      this.currentFrameSourceKey = sourceKey;

      this.currentRoute = "";
      this.currentLens = "";
      this.lensReadyPromise = null;
      this.srcDocReadyPromise = null;
      this.currentSrcDoc = "";

      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
      }

      if (!hadFrame) return;

      const previousIframe = this.displayedIframe;
      // Keep a visible status page while the replacement frame loads so users
      // get immediate feedback without seeing stale page content.
      this.shadowRootContainer.querySelectorAll("iframe").forEach((iframe) => {
        if (iframe !== previousIframe) iframe.remove();
      });

      const nextIframe = this.createIframeElement();
      // Hidden preloaded frames must not be lazy, or Safari/Firefox can defer
      // them indefinitely and never fire "load".
      nextIframe.loading = "eager";
      nextIframe.style.display = "none";
      this.pendingSwapFromIframe = previousIframe;
      this.pendingSwapTarget = null;
      this.iframe = nextIframe;
      this.attachIframeServices();
      this.showLoadingPage(previousIframe);
    }

    protected showLoadingPage(targetIframe: HTMLIFrameElement) {
      if (this.useBlobForSrcDoc && this.loadingPageBlobUrl) {
        targetIframe.removeAttribute("srcdoc");
        targetIframe.src = this.loadingPageBlobUrl;
      } else {
        targetIframe.srcdoc = LoadingPage;
      }
      this.setAttribute("status", "loading");
    }

    protected armSwapOnNextLoad(targetIframe: HTMLIFrameElement) {
      // Only swap when a replacement frame is pending.
      if (targetIframe === this.displayedIframe) return;
      if (!this.pendingSwapFromIframe) return;
      if (this.pendingSwapTarget === targetIframe) return;

      this.pendingSwapTarget = targetIframe;
      targetIframe.addEventListener(
        "load",
        () => {
          if (this.pendingSwapTarget !== targetIframe) return;
          this.pendingSwapTarget = null;
          if (this.iframe !== targetIframe) return;

          // Swap only after the replacement document is loaded so users never
          // see about:blank or partially styled content between pages.
          const previousIframe = this.pendingSwapFromIframe;
          if (previousIframe?.isConnected) previousIframe.remove();
          targetIframe.style.removeProperty("display");
          this.displayedIframe = targetIframe;
          this.pendingSwapFromIframe = null;
          this.transcludeIdTracker.track(this, targetIframe);
        },
        { once: true },
      );
    }

    protected alive = true;
    send(eventName: string, payload?: unknown) {
      this.sendEvent(eventName, payload);
    }
    disconnectedCallback() {
      this.alive = false;
      this.transcludeIdTracker.untrack(this);
      this.destroyEvents();
      this.destroyNavigation();
      if (this.loadingPageBlobUrl) {
        URL.revokeObjectURL(this.loadingPageBlobUrl);
      }
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
        const srcdoc = this.getAttribute("srcdoc");
        this.replaceIframeForSourceChange(`srcdoc:${srcdoc ?? ""}`);

        // srcdoc mode renders raw HTML directly in the iframe.
        // Reset lens/route state so returning to src mode reloads the lens page.
        this.currentRoute = "";
        this.currentLens = "";
        this.lensReadyPromise = null;

        // If no source, then a lens is using transclude
        // to manually set page contents. Just pay attention
        // to the srcdoc and the query in this case.
        if (srcdoc === null) {
          return this.setSrcDoc(LoadingPage, "loading");
        }

        const token = ++this.renderVersion;

        // If the doc is already set, just set the query.
        if (this.currentSrcDoc === srcdoc) {
          await this.srcDocReadyPromise;
          if (!this.alive || token !== this.renderVersion) return;
          this.setQuery(this.getAttribute("query") || "");
          return;
        }

        this.srcDocReadyPromise = new Promise((resolve) => {
          this.iframe.addEventListener("load", () => resolve(), { once: true });
        });

        this.setSrcDoc(srcdoc, "ok");

        await this.srcDocReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;

        this.setQuery(this.getAttribute("query") || "");
        return;
      }

      const url = new URL(src, origin).toString();
      if (!url.startsWith(origin + "/#/")) {
        this.replaceIframeForSourceChange(`src-invalid:${src}`);
        return this.setSrcDoc(
          ErrorPage(`Could not extract page name from src: ${src}`),
          "error",
        );
      }
      const route = url.slice(origin.length + 3);
      if (this.currentRoute === route) return;
      this.currentRoute = route;

      const { name: lens, query: lensQuery } = parseAddress(route);
      const { params, address } = parseQuery(lensQuery);
      this.replaceIframeForSourceChange(
        `src:${lens}${address ? `/${parseAddress(address).name}` : ""}`,
      );

      const token = ++this.renderVersion;

      if (this.currentLens === lens) {
        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        this.setQuery(composeQuery(params, address));
        return;
      }
      this.currentLens = lens;
      this.setAttribute("status", "loading");

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

        this.setQuery(composeQuery(params, address));
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
        this.armSwapOnNextLoad(this.iframe);
        this.iframe.srcdoc = srcdoc;
        // Append only after assigning content so "load" corresponds to the new
        // document, not the initial about:blank load.
        if (!this.iframe.isConnected) {
          this.shadowRootContainer.append(this.iframe);
        }
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
      this.armSwapOnNextLoad(this.iframe);
      // If srcdoc is set, it wins over src; clear it before URL navigation.
      this.iframe.removeAttribute("srcdoc");
      this.iframe.src = url;
      // Append only after src is assigned so the first load event we react to
      // is for the target URL.
      if (!this.iframe.isConnected) {
        this.shadowRootContainer.append(this.iframe);
      }

      this.setAttribute("status", status);
    }

    // Rerender on initialization or src/srcdoc changes
    static get observedAttributes(): string[] {
      return ["src", "srcdoc", "query", "id", "name"];
    }
    connectedCallback() {
      this.transcludeIdTracker.track(this, this.iframe);
      this.renderPage();
    }
    attributeChangedCallback(name: string) {
      if (name === "id" || name === "name") {
        this.transcludeIdTracker.notifyIdChanged(this);
        return;
      }
      this.renderPage();
    }
    adoptedCallback() {
      this.transcludeIdTracker.syncIframeWindow(this);
      this.renderPage();
    }
  }

  customElements.define("sw-transclude", SocialWikiTransclude);
}
