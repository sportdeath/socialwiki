import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const mocks = vi.hoisted(() => ({
  getMedia: vi.fn(),
  loadDocument: vi.fn(async () => "<p>Browser</p>"),
  getSiteVersions: vi.fn(async () => []),
  discovery: undefined as any,
  trust: undefined as any,
}));
vi.mock("@graffiti-garden/wrapper-vue", () => ({
  GraffitiPlugin: { install() {} },
  useGraffiti: () => ({ getMedia: mocks.getMedia }),
  useGraffitiDiscover: () => mocks.discovery,
}));
vi.mock("../../lenses/src/utils/use-trust-context", () => ({
  useTrustContext: () => mocks.trust,
}));
vi.mock("../../lenses/src/utils/site-versions", () => ({
  siteStateSchema: () => ({}), normalizeSiteVersions: (values: unknown) => values,
  sortSiteVersions: (values: unknown) => values, pickVersion: (values: any[]) => values[0],
  getSiteVersions: mocks.getSiteVersions,
}));
vi.mock("../../lenses/src/utils/protection", () => ({ sortProtectionHistory: () => [] }));
vi.mock("../src/bridges/resolution/document", () => ({ loadDocument: mocks.loadDocument }));

beforeEach(() => {
  vi.resetModules();
  mocks.getMedia.mockReset();
  mocks.loadDocument.mockClear();
  mocks.getSiteVersions.mockClear();
  mocks.discovery = {
    objects: ref([{ value: { document: "version-one" } }]), error: ref(null), isFirstPoll: ref(false),
  };
  mocks.trust = { sessionReady: ref(true), trustedEditors: ref(new Set(["alice"])), trustError: ref(null) };
  Object.assign(window, {
    socialWikiLensesUrl: "https://social.example/",
    address: "/demo", params: new URLSearchParams(), emit: vi.fn(),
    route: { parseAddress: () => ({ name: "demo", query: "" }) },
    Graffiti: class {},
  });
  document.body.innerHTML = '<div id="app"></div><template id="app-template"><sw-transclude ref="transclude" :id="displayed.id" :srcdoc="displayed.html"></sw-transclude></template>';
});

it("rechecks the personal browser only when the active identity changes", async () => {
  const events = new EventTarget();
  window.Graffiti = class { sessionEvents = events; } as any;
  document.body.innerHTML = "<sw-transclude></sw-transclude>";
  const { startBrowserLoader } = await import("../../lenses/src/bootstrap");
  startBrowserLoader();
  const emit = (type: string, detail?: unknown) => events.dispatchEvent(new CustomEvent(type, { detail }));
  emit("initialized");
  await vi.waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledTimes(1));
  emit("login", { session: { actor: "alice" } });
  await vi.waitFor(() => expect(mocks.getSiteVersions).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledTimes(2));
  emit("login", { session: { actor: "alice", guardSites: [["new-child"]] } });
  emit("initialized");
  emit("logout", { actor: "another-account" });
  await nextTick();
  expect(mocks.getSiteVersions).toHaveBeenCalledTimes(1);
  expect(mocks.loadDocument).toHaveBeenCalledTimes(2);
  emit("logout", { actor: "alice" });
  await vi.waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledTimes(3));
});
afterEach(() => {
  // The entry module owns its app; unmount it to dispose its reactive watchers.
  (document.querySelector("#app") as any)?.__vue_app__?.unmount();
  document.body.innerHTML = "";
});

it("keeps the document mounted while login updates trust, then replaces it only if the selected version changes", async () => {
  mocks.getMedia.mockResolvedValue({ data: new Blob(["<p>First version</p>"]) });
  await import("../../lenses/src/view/main");
  const child = document.querySelector("sw-transclude")!;
  await vi.waitFor(() => expect(child.getAttribute("srcdoc")).toBe("<p>First version</p>"));
  const id = child.id;
  const changes: string[] = [];
  const observer = new MutationObserver(() => changes.push(child.getAttribute("srcdoc")!));
  observer.observe(child, { attributes: true, attributeFilter: ["srcdoc", "id"] });
  try {
    mocks.trust.trustedEditors.value = undefined;
    await nextTick();
    expect(child.getAttribute("srcdoc")).toBe("<p>First version</p>");
    mocks.trust.trustedEditors.value = new Set(["alice", "bob"]);
    await vi.waitFor(() => expect(mocks.getMedia).toHaveBeenCalledTimes(2));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(child.id).toBe(id);
    expect(changes).toEqual([]);

    mocks.getMedia.mockResolvedValue({ data: new Blob(["<p>New selected version</p>"]) });
    mocks.discovery.objects.value = [{ value: { document: "version-two" } }];
    await vi.waitFor(() => expect(child.getAttribute("srcdoc")).toBe("<p>New selected version</p>"));
    expect(child.id).not.toBe(id);
  } finally { observer.disconnect(); }
});
