import type { Graffiti } from "@graffiti-garden/api";
import {
  getPageVersions,
  pageVersionSchema,
  type PageVersionObject,
} from "./page-versions";

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
    currentVersion: null | string = null;
    async renderPage() {
      if (!this.alive) return;

      const src = this.getAttribute("src");
      if (src === null) {
        const srcdoc = this.getAttribute("srcdoc");
        return srcdoc ? this.setSrcDoc(srcdoc) : this.pageNotFound();
      }

      const version = this.getAttribute("version");
      if (this.currentSrc === src && this.currentVersion === version) return;
      this.currentSrc = src;
      this.currentVersion = version;

      const token = ++this.renderVersion;
      this.pageLoading();

      try {
        let selectedPageVersion: PageVersionObject;

        if (version === null) {
          const pageVersions = await getPageVersions(graffiti, src);

          // TODO: add more logic here
          const potentialPageVersion = pageVersions.at(0);
          if (!potentialPageVersion) return this.pageNotFound();
          selectedPageVersion = potentialPageVersion;
        } else {
          selectedPageVersion = await graffiti.get<
            ReturnType<typeof pageVersionSchema>
          >(version, pageVersionSchema(src));
        }
        if (!this.alive || token !== this.renderVersion) return;

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
      this.setSrcDoc(loading);
    }
    pageNotFound() {
      this.setSrcDoc(pageNotFound);
    }
    pageError() {
      this.setSrcDoc(error);
    }
    setSrcDoc(srcdoc: string) {
      if (this.currentSrcDoc === srcdoc) return;
      this.currentSrcDoc = srcdoc;
      this.iframe.srcdoc = srcdoc;
      this.setAttribute("srcdoc", srcdoc);
    }

    // Rerender on initialization or src/srcdoc changes
    static get observedAttributes(): string[] {
      return ["src", "srcdoc", "version"];
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

const style = `
<style>
:root {
    color-scheme: light dark;
    --background-color: #fff;
    --text-color: #202122;
    --title-color: #101418;
}

@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        --background-color: #101418;
        --text-color: #eaecf0;
        --title-color: #f8f9fa;
    }
}

html, body, main {
  height: 100%;
}

body {
  background: var(--background-color);
  color: var(--text-color);
  font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}

main {
  display: flex;
  align-items: center;
  justify-content: center;
}

h1 {
  color: var(--title-color);
}

.dots::after {
    content: "";
    display: inline-block;
    width: 3ch;
    animation: dots 0.7s linear infinite;
}

@keyframes dots {
    0%   { content: ""; }
    25%  { content: "."; }
    50%  { content: ".."; }
    75%  { content: "..."; }
}
</style>
`;

const loading = `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
          <h1 class="dots">Page loading</h1>
        </main>
    </body>
</html>
`;

const pageNotFound = `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
            <h1>Page not found.</h1>
        </main>
    </body>
</html>
`;

const error = `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
            <h1>Error loading page.</h1>
        </main>
    </body>
</html>
`;
