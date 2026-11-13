import { afterEach, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@graffiti-garden/wrapper-vue", () => ({
  useGraffitiDiscover: () => ({
    objects: ref([]), error: ref(null), isFirstPoll: ref(false), poll: async () => {},
  }),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function serveDocument() {
  window.socialWikiLensesUrl = "https://social.example/";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    '<!doctype html><html><head><script src="../init.js"></script></head><body><p>Loaded lens</p></body></html>',
  )));
}

it.each([false, true])("loads the default browser as HTML (logged in: %s)", async (loggedIn) => {
  serveDocument();
  const events = new EventTarget();
  window.Graffiti = class {
    sessionEvents = events;
    async *discover() {}
  } as any;
  window.query = "?/v?/Social.Wiki";
  document.body.innerHTML = "<sw-transclude></sw-transclude>";
  const { startBrowserLoader } = await import("../../lenses/src/bootstrap");
  startBrowserLoader();
  if (loggedIn) {
    events.dispatchEvent(new CustomEvent("login", {
      detail: { session: { actor: "did:example:local-test" } },
    }));
  }
  events.dispatchEvent(new CustomEvent("initialized"));
  const browser = document.querySelector("sw-transclude")!;
  await vi.waitFor(() => expect(browser.getAttribute("srcdoc")).toContain("<p>Loaded lens</p>"));
  expect(browser.getAttribute("srcdoc")).toContain('src="https://social.example/init.js"');
  expect(browser.getAttribute("query")).toBe("?/v?/Social.Wiki");
});

it("resolves the browser's default View lens as HTML through the real loader", async () => {
  serveDocument();
  const { useLensSources } = await import("../../lenses/src/browser/lens-resolver");
  const sources = useLensSources({} as any, () => null);
  const result = await sources.resolveDocument("?/Social.Wiki");
  expect(typeof result.srcdoc).toBe("string");
  expect(result.srcdoc).toContain("<p>Loaded lens</p>");
  expect(result.srcdoc).toContain('src="https://social.example/init.js"');
  expect(result.query).toBe("?/Social.Wiki");
});
