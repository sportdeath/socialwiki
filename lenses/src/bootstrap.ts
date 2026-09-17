import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { loadDocument } from "../../kernel/src/bridges/resolution/document";
import { lensesUrl } from "./utils/locator";
import { getPageVersions } from "./utils/page-versions";
import { ErrorPage } from "./utils/status-pages";

function getBrowserElement() {
  const element = document.querySelector("sw-transclude");
  if (!element) {
    throw new Error("The browser loader needs a transclude element");
  }
  return element;
}

export function startBrowserLoader() {
  const browser = getBrowserElement();
  const graffiti = new window.Graffiti();
  let session: GraffitiSession | null = null;
  let initialized = false;
  let loadVersion = 0;

  // The kernel gives the top-level route to this loader. Delegate that same
  // query through the loader's transclude to whichever browser it selected.
  function syncBrowserRoute() {
    browser.setAttribute("query", window.query);
  }

  async function defaultBrowser(signal?: AbortSignal) {
    return loadDocument(
      new URL("browser/index.html", lensesUrl),
      signal,
    );
  }

  async function publishedBrowser(currentSession: GraffitiSession) {
    // getPageVersions returns reverse chronological/topological order, so
    // find() selects this actor's latest publication.
    const versions = await getPageVersions(graffiti, "browser");
    const version = versions.find(
      (candidate) => candidate.actor === currentSession.actor,
    );
    if (!version) return null;

    const media = await graffiti.getMedia(
      version.value.result.media,
      { types: ["text/html"] },
      currentSession,
    );
    return media.data.text();
  }

  async function loadBrowser() {
    const version = ++loadVersion;

    try {
      const html = session ? await publishedBrowser(session) : null;
      const source = html ?? (await defaultBrowser());
      if (version !== loadVersion) return;
      browser.setAttribute("srcdoc", source);
      syncBrowserRoute();
    } catch (error) {
      console.error("Could not load the personal browser", error);
      try {
        const source = await defaultBrowser();
        if (version !== loadVersion) return;
        browser.setAttribute("srcdoc", source);
        syncBrowserRoute();
      } catch (fallbackError) {
        console.error("Could not load the default browser", fallbackError);
        if (version !== loadVersion) return;
        browser.setAttribute(
          "srcdoc",
          ErrorPage(
            `Could not load the browser: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          ),
        );
      }
    }
  }

  // The loader is transparent to the selected browser: routes and unhandled
  // application events continue across this otherwise invisible document.
  window.handleNavigation((to) => window.navigate(to));
  browser.onUnhandledEvent = (event) => window.emit(event.type, event.detail);
  window.addEventListener("querychange", syncBrowserRoute);
  graffiti.sessionEvents.addEventListener("login", (event) => {
    const detail = (event as GraffitiLoginEvent).detail;
    if (detail.error) {
      console.error(detail.error);
      return;
    }
    session = detail.session;
    if (initialized) void loadBrowser();
  });

  graffiti.sessionEvents.addEventListener("logout", (event) => {
    const detail = (event as GraffitiLogoutEvent).detail;
    if (detail.error) {
      console.error(detail.error);
      return;
    }
    if (session?.actor === detail.actor) session = null;
    if (initialized) void loadBrowser();
  });

  graffiti.sessionEvents.addEventListener("initialized", (event) => {
    const detail = (event as GraffitiSessionInitializedEvent).detail;
    if (detail?.error) console.error(detail.error);
    initialized = true;
    void loadBrowser();
  });
}
