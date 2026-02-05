import type { Graffiti } from "@graffiti-garden/api";
import { inputLensAddress, serveLens } from "./lens-server";

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
        return srcdoc ? this.setSrcDoc(srcdoc, "ok") : this.pageLoading();
      }

      if (this.currentSrc === src) return;

      const url = new URL(src, origin).toString();
      if (!url.startsWith(origin + "/#/")) {
        return this.pageError(`Could not extract page name from src: ${src}`);
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

      this.pageLoading();

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
                <a href="#/edit/${pageName}">
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
