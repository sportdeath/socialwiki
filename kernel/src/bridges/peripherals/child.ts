import { CallOptions, connect, WindowMessenger } from "penpal";
import { installPeripheralAdapters } from "./adapters";
import { PERIPHERALS_CHANNEL, type ChildMethods, type PeripheralsService,
  type PeripheralSink, type ParentMethods, type Subscription } from "./shared";

declare global {
  interface Window {
    /** Open trusted permission controls for this document and its descendants. */
    showPeripheralPermissions(): Promise<void>;
  }
}

export function installPeripheralsChild(): PeripheralsService {
  let nextId = 1;
  const subscriptions = new Map<number, { kind: Subscription["kind"]; update: PeripheralSink; close: () => void }>();
  const methods: ChildMethods = {
    update(id, value) {
      const entry = subscriptions.get(id);
      if (!entry) return;
      if (value.type !== "data") subscriptions.delete(id);
      entry.update(value);
    },
  };
  const connection = connect<ParentMethods>({
    messenger: new WindowMessenger({ remoteWindow: window.parent, allowedOrigins: ["*"] }),
    channel: PERIPHERALS_CHANNEL, methods, timeout: 15000,
  });
  void connection.promise.catch(() => {});
  function open(value: Subscription, update: PeripheralSink = () => {}) {
    const id = nextId++;
    const close = () => {
      if (!subscriptions.delete(id)) return;
      void connection.promise.then((remote) => remote.close(id)).catch(() => {});
    };
    subscriptions.set(id, { kind: value.kind, update, close });
    void connection.promise.then((remote) => {
      if (subscriptions.has(id)) return remote.open(id, value);
    }).catch(() => {
      if (!subscriptions.has(id)) return;
      close();
      update({ type: "error", name: "NotReadableError", message: "The peripherals bridge is unavailable." });
    });
    return { stop: close, async send(message: unknown) {
      const remote = await connection.promise;
      if (!subscriptions.has(id)) throw new Error("Peripheral request is unavailable.");
      return remote.send(id, message, new CallOptions({ timeout: 15000 }));
    } };
  }
  const service: PeripheralsService = {
    registerDocument: (source) => open({ kind: "document", source }).stop,
    start: (request, update) => open({ ...request, kind: "request" }, update),
    async showPermissions(source) { await (await connection.promise).showPermissions(source); },
  };
  window.addEventListener("pagehide", () => {
    for (const entry of subscriptions.values()) if (entry.kind === "request") entry.close();
  });
  installPeripheralAdapters(service);
  window.showPeripheralPermissions = async () => { await service.showPermissions([]); };
  return service;
}
