import type { Graffiti } from "@graffiti-garden/api";
import { inputLensAddress, serveLens } from "./lens-server";
import { ErrorPage, LoadingPage } from "./status-pages";

const lenses = {
  view: "src/lenses/view/index.html",
  edit: "src/lenses/edit/index.html",
  history: "src/lenses/history/index.html",
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
    }

    protected alive = true;
    disconnectedCallback() {
      this.alive = false;
      this.destroyLens();
    }

    protected currentSrc = "";
    protected currentLens = "";
    protected lensReadyPromise: Promise<void> | null = null;
    async renderPage() {
      if (!this.alive) return;

      const src = this.getAttribute("src");
      if (src === null) {
        const srcdoc = this.getAttribute("srcdoc");
        return srcdoc
          ? this.setSrcDoc(srcdoc, "ok")
          : this.setSrcDoc(LoadingPage, "loading");
      }

      if (this.currentSrc === src) return;

      const url = new URL(src, origin).toString();
      if (!url.startsWith(origin + "/#/")) {
        return this.setSrcDoc(
          ErrorPage(`Could not extract page name from src: ${src}`),
          "error",
        );
      }
      const route = url.slice(origin.length + 3);

      // The "lens" is everything before the first "/"
      // The "address" is everything after the first "/"
      const [lens, address] = route.split(/\/(.+)/).filter(Boolean);

      const token = ++this.renderVersion;

      if (this.currentLens === lens) {
        this.currentSrc = src;
        await this.lensReadyPromise;
        if (!this.alive || token !== this.renderVersion) return;
        inputLensAddress(this.iframe, address);
        return;
      }

      this.setSrcDoc(LoadingPage, "loading");

      this.currentSrc = src;
      this.currentLens = lens;

      try {
        assertLens(lens);
        const lensSource = lenses[lens];

        this.lensReadyPromise = (async () => {
          const response = await fetch(`${origin}/${lensSource}`);
          if (!this.alive || token !== this.renderVersion) return;

          if (!response.ok) {
            throw new Error(`Error fetching lens: ${response.statusText}`);
          }

          const html = await response.text();
          if (!this.alive || token !== this.renderVersion) return;

          this.setSrcDoc(html, "loading");
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
      this.iframe.srcdoc = srcdoc;
      this.setAttribute("status", status);
    }

    // Rerender on initialization or src/srcdoc changes
    static get observedAttributes(): string[] {
      return ["src", "srcdoc"];
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
