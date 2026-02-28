// Internal messages used only for propagating transclude metadata upward.
// `token` identifies a window instance; path segments come from parent-assigned
// `<sw-transclude id="...">` / `<sw-transclude name="...">` values.
type TranscludeTrackerMessage =
  | {
      type: "sw-transclude-self";
      token: string;
    }
  | {
      type: "sw-transclude-descendants";
      token: string;
      descendants: {
        token: string;
        id: string[];
        name: string[];
      }[];
    };

type TranscludePaths = {
  id: string[];
  name: string[];
};

const transcludeIdLookups = new WeakMap<
  Window,
  (target: Window) => string | undefined
>();
const transcludeNameLookups = new WeakMap<
  Window,
  (target: Window) => string[] | undefined
>();

function encodeTranscludeIdPath(path: readonly string[]): string {
  // Encode each segment, then join with "/" so segment boundaries are preserved.
  return path.map((segment) => encodeURIComponent(segment)).join("/");
}

// Root-facing lookup helper: given a target window, return the encoded
// transclude ID path ("parentId/childId/...") known by the specified root.
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

type TrackedTranscludeHost = HTMLElement;
type TrackedTranscludeState = {
  // The iframe owned by a specific <sw-transclude> host.
  iframe: HTMLIFrameElement;
  // The current child window loaded in that iframe (if available).
  childWindow: Window | null;
  // Opaque token announced by the child window itself.
  childToken: string | null;
  // Descendant paths reported by the child, keyed by descendant window token.
  childDescendants: Map<string, TranscludePaths>;
};

export function createTranscludeIdTracker() {
  // Each window chooses a local token for itself. Descendant ID paths are
  // propagated upward keyed by these tokens, and the root joins tokens back to
  // actual Window objects from direct postMessage senders.
  const selfToken = `swt-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  // All transclude hosts in this window that currently participate in tracking.
  const trackedHosts = new Set<TrackedTranscludeHost>();
  // Per-host runtime state; keyed by host element so GC can clean up naturally.
  const stateByHost = new WeakMap<
    TrackedTranscludeHost,
    TrackedTranscludeState
  >();
  // Reverse lookup from direct child iframe window -> owning transclude host.
  const hostByChildWindow = new WeakMap<Window, TrackedTranscludeHost>();
  // Window token announcements learned from postMessage senders.
  const tokenByWindow = new WeakMap<Window, string>();
  // The current aggregate path table for this window, keyed by token.
  const pathsByToken = new Map<string, TranscludePaths>();

  const postTrackerMessage = (
    target: Window | null | undefined,
    message: TranscludeTrackerMessage,
  ) => {
    if (!target || target === window) return;
    target.postMessage(message, "*");
  };

  const announceSelf = () => {
    // Direct parents (and optionally top) learn this window's token by sourceWindow.
    const message: TranscludeTrackerMessage = {
      type: "sw-transclude-self",
      token: selfToken,
    };
    postTrackerMessage(window.parent, message);
    if (window.top && window.top !== window.parent) {
      postTrackerMessage(window.top, message);
    }
  };

  const publishDescendants = () => {
    // Recompute from local transcludes + child-reported descendant paths.
    const descendants = new Map<string, TranscludePaths>();

    for (const host of trackedHosts) {
      const state = stateByHost.get(host);
      if (!state) continue;

      const id = host.id || `${Math.random().toString(36).slice(2, 10)}`;
      const name = host.getAttribute("name") || "Unnamed";

      // Only the immediate parent contributes this ID segment.
      if (state.childToken) {
        descendants.set(state.childToken, { id: [id], name: [name] });
      }
      for (const [token, childPaths] of state.childDescendants) {
        descendants.set(token, {
          id: [id, ...childPaths.id],
          name: [name, ...childPaths.name],
        });
      }
    }

    pathsByToken.clear();
    for (const [token, paths] of descendants) {
      pathsByToken.set(token, paths);
    }

    if (window.top === window) return;
    // Forward only to the parent. Each level prefixes its own IDs before
    // forwarding again, so IDs flow up rather than down.
    postTrackerMessage(window.parent, {
      type: "sw-transclude-descendants",
      token: selfToken,
      descendants: [...descendants].map(([token, paths]) => ({
        token,
        id: paths.id,
        name: paths.name,
      })),
    });
  };

  const syncIframeWindow = (host: TrackedTranscludeHost) => {
    // Refresh bindings when an iframe loads/reloads and gets a new Window object.
    const state = stateByHost.get(host);
    if (!state) return;

    const nextChildWindow = state.iframe.contentWindow;
    if (state.childWindow === nextChildWindow) return;

    if (state.childWindow) {
      hostByChildWindow.delete(state.childWindow);
    }

    state.childWindow = nextChildWindow;
    state.childToken = nextChildWindow
      ? (tokenByWindow.get(nextChildWindow) ?? null)
      : null;
    state.childDescendants.clear();

    if (nextChildWindow) {
      hostByChildWindow.set(nextChildWindow, host);
    }

    publishDescendants();
  };

  const track = (host: TrackedTranscludeHost, iframe: HTMLIFrameElement) => {
    // Called from <sw-transclude>.connectedCallback.
    trackedHosts.add(host);

    const state = stateByHost.get(host) ?? {
      iframe,
      childWindow: null,
      childToken: null,
      childDescendants: new Map<string, TranscludePaths>(),
    };
    state.iframe = iframe;
    stateByHost.set(host, state);

    syncIframeWindow(host);
    publishDescendants();
  };

  const untrack = (host: TrackedTranscludeHost) => {
    // Called from <sw-transclude>.disconnectedCallback.
    trackedHosts.delete(host);
    const state = stateByHost.get(host);
    if (!state) {
      publishDescendants();
      return;
    }

    if (state.childWindow) {
      hostByChildWindow.delete(state.childWindow);
    }
    state.childWindow = null;
    state.childToken = null;
    state.childDescendants.clear();
    publishDescendants();
  };

  const notifyIdChanged = (host: TrackedTranscludeHost) => {
    // Host IDs are the actual user-assigned path segments; republish on change.
    if (!trackedHosts.has(host)) return;
    publishDescendants();
  };

  // Install a local lookup for callers (typically the root) to map a real
  // `Window` object to the currently known encoded transclude ID path.
  transcludeIdLookups.set(window, (target) => {
    if (target === window) return "";
    const token = tokenByWindow.get(target);
    if (!token) return;
    const paths = pathsByToken.get(token);
    if (!paths) return;
    return encodeTranscludeIdPath(paths.id);
  });
  transcludeNameLookups.set(window, (target) => {
    if (target === window) return [];
    const token = tokenByWindow.get(target);
    if (!token) return;
    const paths = pathsByToken.get(token);
    if (!paths) return;
    return [...paths.name];
  });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!event.source) return;
    const sourceWindow = event.source as Window;
    const data = event.data;
    if (typeof data !== "object" || data === null) return;

    const d = data as Partial<TranscludeTrackerMessage>;
    if (d.type === "sw-transclude-self" && typeof d.token === "string") {
      // Child announces its token; we can now associate future reports and guard
      // requests (which contain sourceWindow) with the same logical window.
      tokenByWindow.set(sourceWindow, d.token);

      const host = hostByChildWindow.get(sourceWindow);
      const state = host ? stateByHost.get(host) : undefined;
      if (state && state.childToken !== d.token) {
        state.childToken = d.token;
        publishDescendants();
      }
      return;
    }

    if (
      d.type !== "sw-transclude-descendants" ||
      typeof d.token !== "string" ||
      !Array.isArray(d.descendants)
    ) {
      return;
    }

    const host = hostByChildWindow.get(sourceWindow);
    const state = host ? stateByHost.get(host) : undefined;
    if (!state) return;

    // Child reported its descendants. We trust only the child subtree here; the
    // current parent still prefixes its own host.id before forwarding upward.
    tokenByWindow.set(sourceWindow, d.token);
    state.childToken = d.token;
    state.childDescendants.clear();
    for (const entry of d.descendants) {
      if (typeof entry !== "object" || entry === null) continue;
      const { token, id, name } = entry as {
        token?: unknown;
        id?: unknown;
        name?: unknown;
      };
      if (typeof token !== "string") continue;
      if (!Array.isArray(id) || !id.every((part) => typeof part === "string")) {
        continue;
      }
      state.childDescendants.set(token, {
        id: [...id],
        name:
          Array.isArray(name) && name.every((part) => typeof part === "string")
            ? [...name]
            : [...id],
      });
    }
    publishDescendants();
  });

  // Send an initial self announcement, and repeat on bfcache restore.
  announceSelf();
  window.addEventListener("pageshow", announceSelf);

  return {
    track,
    untrack,
    syncIframeWindow,
    notifyIdChanged,
  };
}
