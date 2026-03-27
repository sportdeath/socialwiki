import editLensSourceDefault from "../lenses/edit/index.html?raw";
import historyLensSourceDefault from "../lenses/history/index.html?raw";
import viewLensSourceDefault from "../lenses/view/index.html?raw";

const lensSourceDefaults = {
  v: viewLensSourceDefault,
  e: editLensSourceDefault,
  h: historyLensSourceDefault,
} as const;

export type Lens = keyof typeof lensSourceDefaults;

const STORAGE_KEY = "socialwiki:lens-overrides:v1";
const REQUEST_TYPE = "sw-lens-source-request";
const RESPONSE_TYPE = "sw-lens-source-response";
const REQUEST_TIMEOUT_MS = 2000;
// Intentionally wildcard for sandboxed/opaque iframe contexts.
const POST_MESSAGE_TARGET = "*";

type LensAction = "get" | "set" | "reset";
type LensOverrides = Partial<Record<Lens, string>>;

type LensRequest = {
  type: typeof REQUEST_TYPE;
  requestId: string;
  action: LensAction;
  lens: string;
  source?: string;
};

type LensResponse = {
  type: typeof RESPONSE_TYPE;
  requestId: string;
  ok: boolean;
  source?: string;
  error?: string;
};

let bridgeInstalled = false;
let memoryOverrides: LensOverrides = {};

export function isLens(value: string): value is Lens {
  return value in lensSourceDefaults;
}

function assertLens(value: string): asserts value is Lens {
  if (!isLens(value)) throw new Error(`Unrecognized lens: ${value}`);
}

function readOverrides(): LensOverrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryOverrides = {};
      return {};
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      memoryOverrides = {};
      return {};
    }

    const overrides: LensOverrides = {};
    for (const [lens, source] of Object.entries(parsed)) {
      if (isLens(lens) && typeof source === "string") {
        overrides[lens] = source;
      }
    }
    memoryOverrides = overrides;
    return overrides;
  } catch {
    // localStorage can throw in sandboxed or storage-blocked contexts.
    return { ...memoryOverrides };
  }
}

function writeOverrides(overrides: LensOverrides) {
  memoryOverrides = { ...overrides };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Keep an in-memory fallback when localStorage is unavailable.
  }
}

export function embedLensSourceOrigin(source: string, origin: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const baseTag = `<base href="${normalizedOrigin}/" />`;

  let normalizedSource = source;
  if (!/<base\s/i.test(normalizedSource)) {
    if (/<head[^>]*>/i.test(normalizedSource)) {
      normalizedSource = normalizedSource.replace(
        /<head[^>]*>/i,
        (headTag) => `${headTag}\n    ${baseTag}`,
      );
    } else {
      normalizedSource = `${baseTag}\n${normalizedSource}`;
    }
  }

  return normalizedSource.replace(
    /(\s(?:src|href)\s*=\s*["'])\/(?!\/)/gi,
    `$1${normalizedOrigin}/`,
  );
}

function getDefaultLensSource(lens: Lens) {
  return lensSourceDefaults[lens];
}

function getLocalLensSource(lens: Lens) {
  const override = readOverrides()[lens];
  if (override !== undefined) return override;
  return getDefaultLensSource(lens);
}

function setLocalLensSource(lens: Lens, source: string) {
  const overrides = readOverrides();
  overrides[lens] = source;
  writeOverrides(overrides);
}

function resetLocalLensSource(lens: Lens) {
  const overrides = readOverrides();
  delete overrides[lens];
  writeOverrides(overrides);
}

async function runAction(
  action: LensAction,
  lens: Lens,
  source?: string,
): Promise<string | undefined> {
  switch (action) {
    case "get":
      return getLocalLensSource(lens);
    case "set":
      if (typeof source !== "string") {
        throw new Error("Lens source must be a string");
      }
      setLocalLensSource(lens, source);
      return;
    case "reset":
      resetLocalLensSource(lens);
      return;
  }

  throw new Error(`Unsupported lens action: ${action}`);
}

function createRequestId() {
  return `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requestTop(
  action: LensAction,
  lens: Lens,
  source?: string,
): Promise<LensResponse> {
  if (window.top === window) {
    return {
      type: RESPONSE_TYPE,
      requestId: "local",
      ok: true,
      source: await runAction(action, lens, source),
    };
  }

  const topWindow = window.top;
  if (!topWindow) throw new Error("No top window available");

  const requestId = createRequestId();
  return new Promise<LensResponse>((resolve, reject) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== "object" || data === null) return;
      const response = data as Partial<LensResponse>;
      if (
        response.type !== RESPONSE_TYPE ||
        response.requestId !== requestId
      ) {
        return;
      }

      cleanup();
      if (!response.ok) {
        reject(
          new Error(
            typeof response.error === "string"
              ? response.error
              : "Lens request failed",
          ),
        );
        return;
      }
      resolve(response as LensResponse);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Lens request timed out"));
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    const request: LensRequest = {
      type: REQUEST_TYPE,
      requestId,
      action,
      lens,
      source,
    };
    // Sandboxed/opaque iframe contexts can have "null" origin, so we cannot
    // reliably target by origin here.
    topWindow.postMessage(request, POST_MESSAGE_TARGET);
  });
}

export function installLensSourceBridge() {
  if (bridgeInstalled || window.top !== window) return;
  bridgeInstalled = true;

  // Nested transcludes run inside sandboxed iframes that may not have
  // localStorage access. They ask top-level for current lens source via RPC.
  window.addEventListener("message", async (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const request = data as Partial<LensRequest>;
    if (
      request.type !== REQUEST_TYPE ||
      typeof request.requestId !== "string" ||
      typeof request.action !== "string" ||
      typeof request.lens !== "string"
    ) {
      return;
    }

    const sourceWindow = event.source;
    if (
      sourceWindow === null ||
      typeof (sourceWindow as WindowProxy).postMessage !== "function"
    ) {
      return;
    }

    const response: LensResponse = {
      type: RESPONSE_TYPE,
      requestId: request.requestId,
      ok: true,
    };

    try {
      assertLens(request.lens);
      response.source = await runAction(
        request.action as LensAction,
        request.lens,
        request.source,
      );
    } catch (error) {
      response.ok = false;
      response.error = error instanceof Error ? error.message : String(error);
    }

    (sourceWindow as WindowProxy).postMessage(response, POST_MESSAGE_TARGET);
  });
}

export async function getLensSource(lens: Lens, origin: string): Promise<string> {
  let source: string;
  try {
    const response = await requestTop("get", lens);
    source =
      typeof response.source === "string"
        ? response.source
        : getDefaultLensSource(lens);
  } catch {
    // Fall back to the checked-in lens file if top-level RPC is unavailable.
    source = getDefaultLensSource(lens);
  }
  // The lens HTML is injected via srcdoc/blob. Relative root paths (e.g.
  // /init.js, /@vite/client) must be rebound to the host origin explicitly.
  return embedLensSourceOrigin(source, origin);
}

export async function setLensSource(lens: Lens, source: string): Promise<void> {
  await requestTop("set", lens, source);
}

export async function resetLensSource(lens: Lens): Promise<void> {
  await requestTop("reset", lens);
}

export interface LensSourceApi {
  get: (lens: string) => Promise<string>;
  set: (lens: string, source: string) => Promise<void>;
  reset: (lens: string) => Promise<void>;
}

declare global {
  interface Window {
    socialWikiLenses?: LensSourceApi;
  }
}

export function installLensSourceApi(origin: string) {
  if (window.socialWikiLenses) return;

  window.socialWikiLenses = {
    get: async (lens: string) => {
      assertLens(lens);
      return getLensSource(lens, origin);
    },
    set: async (lens: string, source: string) => {
      assertLens(lens);
      await setLensSource(lens, source);
    },
    reset: async (lens: string) => {
      assertLens(lens);
      await resetLensSource(lens);
    },
  };
}
