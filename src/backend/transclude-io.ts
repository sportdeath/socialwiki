export type SwScope = "page" | "lens";

type SwStringRecord = Record<string, string>;

const pageInPrefix = "data-sw-in-";
const lensInPrefix = "data-sw-lens-in-";
const pageOutPrefix = "data-sw-out-";
const lensOutPrefix = "data-sw-lens-out-";

type InboundMessage =
  | {
      type: "sw-io-sync";
      pageInputs: SwStringRecord;
      lensInputs: SwStringRecord;
    }
  | {
      type: "sw-io-receive";
      scope: SwScope;
      name: string;
      payload: string | undefined;
    };

type OutboundMessage =
  | {
      type: "sw-io-set-output";
      scope: SwScope;
      key: string;
      value: string | undefined;
    }
  | {
      type: "sw-io-event";
      scope: SwScope;
      name: string;
      payload: string | undefined;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScope(value: unknown): value is SwScope {
  return value === "page" || value === "lens";
}

function parseScopedInputs(
  element: HTMLElement,
  scope: SwScope,
): Map<string, string> {
  const prefix = scope === "lens" ? lensInPrefix : pageInPrefix;
  const out = new Map<string, string>();

  for (const attrName of element.getAttributeNames()) {
    if (!attrName.startsWith(prefix)) continue;
    const key = attrName.slice(prefix.length);

    const raw = element.getAttribute(attrName);
    if (raw === null) continue;

    out.set(key, raw);
  }

  return out;
}

function mapToObject(map: Map<string, string>): SwStringRecord {
  return Object.fromEntries(map) as SwStringRecord;
}

function objectToMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!isObject(value)) return out;

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;
    out.set(key, raw);
  }

  return out;
}

type HostEvent = {
  scope: SwScope;
  name: string;
  payload: string | undefined;
};

export class HostTranscludeIo {
  protected host: HTMLElement;
  protected iframe: HTMLIFrameElement;
  protected port: MessagePort | null = null;
  protected queuedMessages: InboundMessage[] = [];
  protected routePageInputs = new Map<string, string>();
  protected routeLensInputs = new Map<string, string>();
  protected attrPageInputs = new Map<string, string>();
  protected attrLensInputs = new Map<string, string>();
  protected destroyed = false;
  protected onEvent: (event: HostEvent) => void;

  constructor(
    host: HTMLElement,
    iframe: HTMLIFrameElement,
    onEvent: (event: HostEvent) => void,
  ) {
    this.host = host;
    this.iframe = iframe;
    this.onEvent = onEvent;
    this.refreshAttributeInputs();
  }

  destroy() {
    this.destroyed = true;
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
      this.port = null;
    }
    this.queuedMessages = [];
  }

  reconnect() {
    if (this.destroyed) return;
    if (!this.iframe.contentWindow) return;

    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
      this.port = null;
    }

    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (event: MessageEvent<unknown>) =>
      this.onPortMessage(event.data);
    this.port.start();

    this.iframe.contentWindow.postMessage(
      {
        type: "sw-io-init",
      },
      "*",
      [channel.port2],
    );

    this.syncToChild();

    while (this.queuedMessages.length && this.port) {
      this.port.postMessage(this.queuedMessages.shift()!);
    }
  }

  setRouteInputs(
    pageInputs: Map<string, string>,
    lensInputs: Map<string, string>,
  ) {
    this.routePageInputs = new Map(pageInputs);
    this.routeLensInputs = new Map(lensInputs);
    this.syncToChild();
  }

  clearRouteInputs() {
    this.routePageInputs.clear();
    this.routeLensInputs.clear();
    this.syncToChild();
  }

  refreshAttributeInputs() {
    this.attrPageInputs = parseScopedInputs(this.host, "page");
    this.attrLensInputs = parseScopedInputs(this.host, "lens");
    this.syncToChild();
  }

  send(name: string, payload?: string, scope: SwScope = "page") {
    const message: InboundMessage = {
      type: "sw-io-receive",
      scope,
      name,
      payload,
    };

    if (this.port) {
      this.port.postMessage(message);
      return;
    }

    this.queuedMessages.push(message);
  }

  protected effectiveScopeInputs(scope: SwScope): Map<string, string> {
    const base = scope === "lens" ? this.routeLensInputs : this.routePageInputs;
    const overlay = scope === "lens" ? this.attrLensInputs : this.attrPageInputs;
    const out = new Map(base);
    for (const [k, v] of overlay) {
      out.set(k, v);
    }
    return out;
  }

  protected syncToChild() {
    const message: InboundMessage = {
      type: "sw-io-sync",
      pageInputs: mapToObject(this.effectiveScopeInputs("page")),
      lensInputs: mapToObject(this.effectiveScopeInputs("lens")),
    };

    if (this.port) {
      this.port.postMessage(message);
      return;
    }

    this.queuedMessages.push(message);
  }

  protected setHostOutput(
    scope: SwScope,
    key: string,
    value: string | undefined,
  ) {
    const prefix = scope === "lens" ? lensOutPrefix : pageOutPrefix;
    const attrName = `${prefix}${key}`;

    if (value === undefined) {
      this.host.removeAttribute(attrName);
      return;
    }

    this.host.setAttribute(attrName, value);
  }

  protected onPortMessage(message: unknown) {
    if (!isObject(message) || typeof message.type !== "string") return;

    if (message.type === "sw-io-set-output") {
      const scope = message.scope;
      const key = message.key;
      const value = message.value;

      if (
        !isScope(scope) ||
        typeof key !== "string" ||
        (value !== undefined && typeof value !== "string")
      ) {
        return;
      }

      this.setHostOutput(scope, key, value);
      return;
    }

    if (message.type !== "sw-io-event") return;

    const scope = message.scope;
    const name = message.name;
    const payload = message.payload;

    if (
      !isScope(scope) ||
      typeof name !== "string" ||
      (payload !== undefined && typeof payload !== "string")
    ) {
      return;
    }

    this.onEvent({
      scope,
      name,
      payload,
    });
  }
}

export function isInputAttributeName(name: string): boolean {
  return name.startsWith(pageInPrefix) || name.startsWith(lensInPrefix);
}

export function keyFromInputAttributeName(name: string): string | undefined {
  if (name.startsWith(pageInPrefix)) {
    return name.slice(pageInPrefix.length);
  }
  if (name.startsWith(lensInPrefix)) {
    return name.slice(lensInPrefix.length);
  }
  return;
}

type InputListener = (value: string | undefined) => void;
type ReceiveListener = (payload: string | undefined) => void;
type InputsListener = () => void;

export interface SocialWikiIo {
  getInput(key: string, scope?: SwScope): string | undefined;
  listInputs(scope?: SwScope): SwStringRecord;
  onInput(key: string, cb: InputListener, scope?: SwScope): () => void;
  onInputsChange(cb: InputsListener): () => void;
  setOutput(key: string, value: string | undefined, scope?: SwScope): void;
  onReceive(name: string, cb: ReceiveListener, scope?: SwScope): () => void;
  emit(name: string, payload?: string, scope?: SwScope): void;
}

function listenerMapKey(scope: SwScope, key: string): string {
  return `${scope}\u001f${key}`;
}

export function ensureSocialWikiIo(): SocialWikiIo {
  if (window.socialwiki) return window.socialwiki;

  let pageInputs = new Map<string, string>();
  let lensInputs = new Map<string, string>();

  const inputListeners = new Map<string, Set<InputListener>>();
  const inputsListeners = new Set<InputsListener>();
  const receiveListeners = new Map<string, Set<ReceiveListener>>();

  let port: MessagePort | null = null;
  const outboundQueue: OutboundMessage[] = [];

  function notifyInput(scope: SwScope, key: string, value: string | undefined) {
    const listeners = inputListeners.get(listenerMapKey(scope, key));
    if (!listeners) return;
    for (const cb of listeners) cb(value);
  }

  function notifyInputsChange() {
    for (const cb of inputsListeners) cb();
  }

  function syncInputs(
    nextPageInputs: Map<string, string>,
    nextLensInputs: Map<string, string>,
  ) {
    const pageKeys = new Set<string>();
    const lensKeys = new Set<string>();
    for (const key of pageInputs.keys()) pageKeys.add(key);
    for (const key of nextPageInputs.keys()) {
      pageKeys.add(key);
    }

    for (const key of lensInputs.keys()) lensKeys.add(key);
    for (const key of nextLensInputs.keys()) {
      lensKeys.add(key);
    }

    pageInputs = nextPageInputs;
    lensInputs = nextLensInputs;
    notifyInputsChange();

    for (const key of pageKeys) {
      notifyInput("page", key, pageInputs.get(key));
    }
    for (const key of lensKeys) {
      notifyInput("lens", key, lensInputs.get(key));
    }
  }

  function postOutbound(message: OutboundMessage) {
    if (port) {
      port.postMessage(message);
      return;
    }

    outboundQueue.push(message);
  }

  function replacePort(nextPort: MessagePort) {
    if (port) {
      port.onmessage = null;
      port.close();
    }

    port = nextPort;
    port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (!isObject(data) || typeof data.type !== "string") return;

      if (data.type === "sw-io-sync") {
        const nextPageInputs = objectToMap(data.pageInputs);
        const nextLensInputs = objectToMap(data.lensInputs);

        syncInputs(nextPageInputs, nextLensInputs);
        return;
      }

      if (data.type !== "sw-io-receive") return;

      const scope = data.scope;
      const name = data.name;
      const payload = data.payload;
      if (
        !isScope(scope) ||
        typeof name !== "string" ||
        (payload !== undefined && typeof payload !== "string")
      ) {
        return;
      }

      const listeners = receiveListeners.get(listenerMapKey(scope, name));
      if (!listeners) return;
      for (const cb of listeners) cb(payload);
    };

    port.start();

    while (outboundQueue.length && port) {
      port.postMessage(outboundQueue.shift()!);
    }
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!isObject(data) || data.type !== "sw-io-init") return;

    const nextPort = event.ports[0];
    if (!(nextPort instanceof MessagePort)) return;
    replacePort(nextPort);
  });

  const api: SocialWikiIo = {
    getInput(key, scope = "page") {
      return (scope === "lens" ? lensInputs : pageInputs).get(key);
    },
    listInputs(scope = "page") {
      return mapToObject(scope === "lens" ? lensInputs : pageInputs);
    },
    onInput(key, cb, scope = "page") {
      const mapKey = listenerMapKey(scope, key);
      let listeners = inputListeners.get(mapKey);
      if (!listeners) {
        listeners = new Set();
        inputListeners.set(mapKey, listeners);
      }

      listeners.add(cb);
      cb((scope === "lens" ? lensInputs : pageInputs).get(key));

      return () => {
        listeners?.delete(cb);
        if (listeners && listeners.size === 0) {
          inputListeners.delete(mapKey);
        }
      };
    },
    onInputsChange(cb) {
      inputsListeners.add(cb);
      cb();
      return () => {
        inputsListeners.delete(cb);
      };
    },
    setOutput(key, value, scope = "page") {
      postOutbound({
        type: "sw-io-set-output",
        scope,
        key,
        value,
      });
    },
    onReceive(name, cb, scope = "page") {
      const mapKey = listenerMapKey(scope, name);
      let listeners = receiveListeners.get(mapKey);
      if (!listeners) {
        listeners = new Set();
        receiveListeners.set(mapKey, listeners);
      }
      listeners.add(cb);

      return () => {
        listeners?.delete(cb);
        if (listeners && listeners.size === 0) {
          receiveListeners.delete(mapKey);
        }
      };
    },
    emit(name, payload, scope = "page") {
      postOutbound({
        type: "sw-io-event",
        scope,
        name,
        payload,
      });
    },
  };

  window.socialwiki = api;
  return api;
}

declare global {
  interface Window {
    socialwiki: SocialWikiIo;
  }
}
