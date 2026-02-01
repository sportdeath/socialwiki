import type { Graffiti } from "@graffiti-garden/api";
import {
  getPageVersions,
  pageVersionSchema,
  type PageVersionObject,
} from "./page-versions";

export function installTransclude(graffiti: Graffiti, origin: string) {
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
        return srcdoc
          ? this.setSrcDoc(srcdoc)
          : this.pageError("Transclude must have a src or srcdoc attribute");
      }

      const version = this.getAttribute("version");
      if (this.currentSrc === src && this.currentVersion === version) return;
      this.currentSrc = src;
      this.currentVersion = version;

      const url = new URL(src, origin).toString();
      const prefix = `${origin}/w/`;
      if (!url.startsWith(prefix)) {
        return this.pageError(`Invalid page src: ${src}`);
      }
      const pageName = decodeURIComponent(url.slice(prefix.length));

      const token = ++this.renderVersion;
      this.pageLoading();

      try {
        let selectedPageVersion: PageVersionObject;

        if (version === null) {
          const pageVersions = await getPageVersions(graffiti, pageName);

          // TODO: add more logic here
          const potentialPageVersion = pageVersions.at(0);
          if (!potentialPageVersion) return this.pageNotFound(pageName);
          selectedPageVersion = potentialPageVersion;
        } else {
          selectedPageVersion = await graffiti.get<
            ReturnType<typeof pageVersionSchema>
          >(version, pageVersionSchema(pageName));
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
        return this.pageError(e instanceof Error ? e.message : String(e));
      }
    }
    pageLoading() {
      this.setSrcDoc(loading, "loading");
    }
    pageNotFound(pageName: string) {
      this.setSrcDoc(pageNotFound(pageName, origin), "not-found");
    }
    pageError(e: string) {
      this.setSrcDoc(error(e), "error");
    }
    setSrcDoc(srcdoc: string, status?: string) {
      if (this.currentSrcDoc === srcdoc) return;
      this.currentSrcDoc = srcdoc;
      this.iframe.srcdoc = srcdoc;
      this.setAttribute("srcdoc", srcdoc);
      this.setAttribute("status", status ?? "ok");
      // Send the iframe its own source if status is ok
      if (status === undefined)
        this.iframe.addEventListener(
          "load",
          () => {
            this.iframe.contentWindow?.postMessage(
              {
                type: "transcluded-srcdoc",
                srcdoc,
              },
              "*",
            );
          },
          { once: true },
        );
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

  customElements.define("sw-transclude", SocialWikiTransclude);
}

const style = `
<style>
:root {
    color-scheme: light dark;
    --background-color: #fff;
    --text-color: #202122;
    --title-color: #101418;
    --link-color: #36c;
    --link-hover-color: #3056a9;
    --border-color: #a2a9b1;
    --background-color-interactive: #eaecf0;
    --background-color-interactive-hover: #dadde3;
}

@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        --background-color: #101418;
        --text-color: #eaecf0;
        --title-color: #f8f9fa;
        --link-color: #88a3e8;
        --link-hover-color: #a6bbf5;
        --border-color: #72777d;
        --background-color-interactive: #27292d;
        --background-color-interactive-hover: #404244;

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
  flex-direction: column;
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

a {
    color: var(--link-color);
    cursor: pointer;
    text-decoration: none;
    background: var(--background-color-interactive);
    padding: 1rem;
    border-radius: 0.5rem;
    font-size: 2rem;
    font-weight: bold;
    border: 2px solid var(--border-color);
}

a:hover {
    background: var(--background-color-interactive-hover);
    color: var(--link-hover-color);
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

const pageNotFound = (pageName: string, origin: string) => `
<!doctype html>
<html>
    <head>
      <script src="${origin}/init.js"></script>
      ${style}
    </head>
    <body>
        <main>
            <h1>Nothing here…yet.</h1>
            <p>
                <a href="/e/${encodeURIComponent(pageName)}">
                    Edit page
                </a>
            </p>
        </main>
    </body>
</html>
`;

const error = (e: string) => `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
            <h1>Error loading page.</h1>
            <p>${e}</p>
        </main>
    </body>
</html>
`;
