type TranscludePath = { id: string[]; name: string[] };
type TranscludeTrackerMessage =
  | { type: "sw-transclude-self"; token: string }
  | {
      type: "sw-transclude-descendants";
      token: string;
      descendants: ({ token: string } & TranscludePath)[];
    };
type TrackedHostState = {
  iframe: HTMLIFrameElement;
  childWindow: Window | null;
  childToken: string | null;
  childDescendants: Map<string, TranscludePath>;
};

const transcludeIdLookups = new WeakMap<
  Window,
  (target: Window) => string | undefined
>();
const transcludeNameLookups = new WeakMap<
  Window,
  (target: Window) => string[] | undefined
>();

const randomString = () => Math.random().toString(36).slice(2, 10);
const encodeTranscludeIdPath = (path: readonly string[]) =>
  path.map((segment) => encodeURIComponent(segment)).join("/");
const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((x) => typeof x === "string")
    ? value
    : undefined;

export function getTranscludeId(
  target: Window,
  root: Window = window,
): string | undefined {
  return transcludeIdLookups.get(root)?.(target);
}

export function getTranscludeName(
  target: Window,
  root: Window = window,
): string[] | undefined {
  return transcludeNameLookups.get(root)?.(target);
}

export function createTranscludeIdTracker() {
  const selfToken = randomString();
  // Local runtime state for each <sw-transclude> in this window.
  const hostStates = new Map<HTMLElement, TrackedHostState>();
  // Stable random segment when a host has no explicit `id`.
  const fallbackIdByHost = new WeakMap<HTMLElement, string>();
  // Reverse lookup: immediate child window -> owning host element.
  const hostByChildWindow = new WeakMap<Window, HTMLElement>();
  // Token announcements learned from message source windows.
  const tokenByWindow = new WeakMap<Window, string>();
  // Current aggregate token -> path table for this window's subtree.
  const pathsByToken = new Map<string, TranscludePath>();

  const getHostId = (host: HTMLElement) => {
    if (host.id) return host.id;
    let fallbackId = fallbackIdByHost.get(host);
    if (!fallbackId) {
      fallbackId = randomString();
      fallbackIdByHost.set(host, fallbackId);
    }
    return fallbackId;
  };

  const post = (
    target: Window | null | undefined,
    message: TranscludeTrackerMessage,
  ) => {
    if (target && target !== window) target.postMessage(message, "*");
  };

  const publish = () => {
    // Recompute subtree paths by prefixing each child subtree with the
    // current host's own id/name segment.
    const nextPaths = new Map<string, TranscludePath>();

    for (const [host, state] of hostStates) {
      const id = getHostId(host);
      const name = host.getAttribute("name") || "Unnamed";
      if (state.childToken) {
        nextPaths.set(state.childToken, { id: [id], name: [name] });
      }
      for (const [token, childPaths] of state.childDescendants) {
        nextPaths.set(token, {
          id: [id, ...childPaths.id],
          name: [name, ...childPaths.name],
        });
      }
    }

    pathsByToken.clear();
    for (const [token, paths] of nextPaths) pathsByToken.set(token, paths);

    if (window.top !== window) {
      // Push only upward; parents will prefix and forward again.
      post(window.parent, {
        type: "sw-transclude-descendants",
        token: selfToken,
        descendants: [...nextPaths].map(([token, paths]) => ({
          token,
          id: paths.id,
          name: paths.name,
        })),
      });
    }
  };

  const bindChildWindow = (host: HTMLElement) => {
    const state = hostStates.get(host);
    if (!state) return;

    const nextWindow = state.iframe.contentWindow;
    if (state.childWindow === nextWindow) return;
    if (state.childWindow) hostByChildWindow.delete(state.childWindow);

    state.childWindow = nextWindow;
    // Keep previously learned token when possible; otherwise wait for child
    // self-announcement.
    state.childToken = nextWindow
      ? (tokenByWindow.get(nextWindow) ?? null)
      : null;
    state.childDescendants.clear();
    if (nextWindow) hostByChildWindow.set(nextWindow, host);
  };

  const track = (host: HTMLElement, iframe: HTMLIFrameElement) => {
    const state = hostStates.get(host) ?? {
      iframe,
      childWindow: null,
      childToken: null,
      childDescendants: new Map<string, TranscludePath>(),
    };
    state.iframe = iframe;
    hostStates.set(host, state);
    bindChildWindow(host);
    publish();
  };

  const untrack = (host: HTMLElement) => {
    const state = hostStates.get(host);
    if (state?.childWindow) hostByChildWindow.delete(state.childWindow);
    hostStates.delete(host);
    publish();
  };

  const syncIframeWindow = (host: HTMLElement) => {
    bindChildWindow(host);
    publish();
  };

  const notifyIdChanged = (host: HTMLElement) => {
    if (hostStates.has(host)) publish();
  };

  transcludeIdLookups.set(window, (target) => {
    if (target === window) return "";
    const token = tokenByWindow.get(target);
    const paths = token ? pathsByToken.get(token) : undefined;
    return paths ? encodeTranscludeIdPath(paths.id) : undefined;
  });

  transcludeNameLookups.set(window, (target) => {
    if (target === window) return [];
    const token = tokenByWindow.get(target);
    const paths = token ? pathsByToken.get(token) : undefined;
    return paths ? [...paths.name] : undefined;
  });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!event.source) return;
    if (typeof event.data !== "object" || event.data === null) return;

    const sourceWindow = event.source as Window;
    const data = event.data as Partial<TranscludeTrackerMessage>;

    if (data.type === "sw-transclude-self" && typeof data.token === "string") {
      // Child announces its own token.
      tokenByWindow.set(sourceWindow, data.token);
      const host = hostByChildWindow.get(sourceWindow);
      const state = host ? hostStates.get(host) : undefined;
      if (state && state.childToken !== data.token) {
        state.childToken = data.token;
        publish();
      }
      return;
    }

    if (
      data.type !== "sw-transclude-descendants" ||
      typeof data.token !== "string" ||
      !Array.isArray(data.descendants)
    ) {
      return;
    }

    const host = hostByChildWindow.get(sourceWindow);
    const state = host ? hostStates.get(host) : undefined;
    if (!state) return;

    // Child reports descendant paths relative to itself.
    tokenByWindow.set(sourceWindow, data.token);
    state.childToken = data.token;
    state.childDescendants.clear();

    for (const entry of data.descendants) {
      if (!entry || typeof entry !== "object") continue;
      const token = (entry as { token?: unknown }).token;
      const id = asStringArray((entry as { id?: unknown }).id);
      if (typeof token !== "string" || !id) continue;
      const name = asStringArray((entry as { name?: unknown }).name) ?? id;
      state.childDescendants.set(token, { id: [...id], name: [...name] });
    }

    publish();
  });

  const announceSelf = () => {
    const message: TranscludeTrackerMessage = {
      type: "sw-transclude-self",
      token: selfToken,
    };
    post(window.parent, message);
    if (window.top && window.top !== window.parent) post(window.top, message);
  };

  announceSelf();
  window.addEventListener("pageshow", announceSelf);
  return { track, untrack, syncIframeWindow, notifyIdChanged };
}
