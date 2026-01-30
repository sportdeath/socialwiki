import type { Graffiti } from "@graffiti-garden/api";
import { getPageVersions } from "../helpers/page-versions";

export function installTransclude(graffiti: Graffiti) {
  class SocialWikiTransclude extends HTMLElement {
    protected iframe: HTMLIFrameElement;
    protected renderVersion = 0;

    constructor() {
      super();

      // Attach shadow DOM
      const shadow = this.attachShadow({ mode: "closed" });

      // Create iframe
      this.iframe = document.createElement("iframe");
      this.iframe.title = "SocialWiki Page";
      this.iframe.loading = "lazy";
      this.iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-modals",
        "allow-pointer-lock",
      );

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

    alive = true;
    disconnectedCallback() {
      this.alive = false;
    }

    currentSrc = "";
    currentSrcDoc = "";
    async renderPage() {
      if (!this.alive) return;

      const src = this.getAttribute("src");
      if (src === null) {
        const srcdoc = this.getAttribute("srcdoc");
        return srcdoc ? this.setSrcDoc(srcdoc) : this.pageNotFound();
      }

      if (this.currentSrc === src) return;
      this.currentSrc = src;

      const token = ++this.renderVersion;
      this.pageLoading();

      try {
        const pageVersions = await getPageVersions(graffiti, src);
        if (!this.alive || token !== this.renderVersion) return;

        // TODO: add more logic here
        const selectedPageVersion = pageVersions.at(0);
        if (!selectedPageVersion) return this.pageNotFound();

        const media = await graffiti.getMedia(
          selectedPageVersion.value.result.media,
          {
            types: ["text/html"],
          },
        );
        if (!this.alive || token !== this.renderVersion) return;
        const html = await media.data.text();
        if (!this.alive || token !== this.renderVersion) return;
        this.setSrcDoc(html);
      } catch (e) {
        if (!this.alive || token !== this.renderVersion) return;
        if (e instanceof Error && e.name === "GraffitiErrorNotFound") {
          return this.pageNotFound();
        }
        return this.pageError();
      }
    }
    pageLoading() {
      this.setSrcDoc("Loading...");
    }
    pageNotFound() {
      this.setSrcDoc("Page not found");
    }
    pageError() {
      this.setSrcDoc("Error!");
    }
    setSrcDoc(srcdoc: string) {
      if (this.currentSrcDoc === srcdoc) return;
      this.currentSrcDoc = srcdoc;
      this.iframe.srcdoc = srcdoc;
      this.setAttribute("srcdoc", srcdoc);
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

  customElements.define("social-wiki-transclude", SocialWikiTransclude);
}
