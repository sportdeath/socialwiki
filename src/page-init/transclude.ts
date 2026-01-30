import type { Graffiti } from "@graffiti-garden/api";
import { getPageVersions } from "../helpers/page-versions";

export function installTransclude(graffiti: Graffiti) {
  class SocialWikiTransclude extends HTMLElement {
    protected iframe: HTMLIFrameElement;
    protected renderVersion = 0;

    constructor() {
      super();

      // Attach shadow DOM
      const shadow = this.attachShadow({ mode: "open" });

      // Create iframe
      this.iframe = document.createElement("iframe");
      this.iframe.title = "SocialWiki Page";
      this.iframe.loading = "lazy";
      this.iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-modals",
        "allow-pointer-lock",
        "allow-top-level-navigation",
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
        }
      `;

      shadow.append(style, this.iframe);
      this.renderPage();
    }

    async renderPage() {
      const token = ++this.renderVersion;
      this.pageLoading();
      const src = this.getAttribute("src");
      if (!src) return this.pageNotFound();

      try {
        const pageVersions = await getPageVersions(graffiti, src);
        if (token !== this.renderVersion) return;

        // TODO: add more logic here
        const selectedPageVersion = pageVersions.at(0);
        if (!selectedPageVersion) return this.pageNotFound();

        const media = await graffiti.getMedia(
          selectedPageVersion.value.result.media,
          {
            types: ["text/html"],
          },
        );
        const html = await media.data.text();
        if (token !== this.renderVersion) return;
        this.iframe.srcdoc = html;
      } catch (e) {
        if (token !== this.renderVersion) return;
        if (e instanceof Error && e.name === "GraffitiErrorNotFound") {
          return this.pageNotFound();
        }
        return this.pageError();
      }
    }
    pageLoading() {
      this.iframe.srcdoc = "Loading...";
    }
    pageNotFound() {
      this.iframe.srcdoc = "Page not found";
    }
    pageError() {
      this.iframe.srcdoc = "Error!";
    }

    // When the component initializes, render the page
    connectedCallback() {
      this.renderPage();
    }

    // Whenever the src changes, render the page
    static get observedAttributes(): string[] {
      return ["src"];
    }
    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void {
      if (name === "src" && oldValue !== newValue) {
        this.renderPage();
      }
    }
  }

  customElements.define("social-wiki-transclude", SocialWikiTransclude);
}
