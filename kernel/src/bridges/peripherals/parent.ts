import { CallOptions, connect, WindowMessenger } from "penpal";
import { validateSource, withParentSource } from "../source";
import { PERIPHERALS_CHANNEL, validateSubscription, type ChildMethods,
  type PeripheralsService, type ParentMethods, type Subscription } from "./shared";

/** Requests and document presence share one connection-owned lifetime. */
export function installPeripheralsParent(
  iframe: HTMLIFrameElement, host: HTMLElement, service: PeripheralsService,
) {
  if (!iframe.contentWindow) throw new Error("Missing peripherals child window");
  const subscriptions = new Map<number, { value: Subscription; dispose: () => void }>();
  let destroyed = false;
  function close(id: number) {
    const entry = subscriptions.get(id);
    subscriptions.delete(id);
    entry?.dispose();
  }
  function open(id: number, value: Subscription) {
    const source = withParentSource(host, value.source);
    const dispose = value.kind === "document"
      ? service.registerDocument(source)
      : service.start({ ...value, source }, (update) => {
        if (subscriptions.get(id)?.dispose !== dispose) return;
        if (update.type !== "data") close(id);
        void connection.promise.then((remote) => remote.update(id, update,
          new CallOptions({ timeout: 10000 }))).catch(() => close(id));
      });
    subscriptions.set(id, { value, dispose });
  }
  const methods: ParentMethods = {
    open(id, value) {
      if (destroyed || !Number.isSafeInteger(id) || id < 1 || subscriptions.has(id)) {
        throw new TypeError("Invalid peripherals subscription ID");
      }
      open(id, validateSubscription(value));
    },
    close(id) { if (id > 0) close(id); },
    showPermissions(source) {
      if (destroyed) throw new Error("Peripherals bridge was destroyed");
      return service.showPermissions(withParentSource(host, validateSource(source)));
    },
  };
  const connection = connect<ChildMethods>({
    messenger: new WindowMessenger({ remoteWindow: iframe.contentWindow, allowedOrigins: ["*"] }),
    channel: PERIPHERALS_CHANNEL, methods,
  });
  // WindowMessenger pins the WindowProxy; '*' supports opaque child origins.
  void connection.promise.catch(() => {});
  open(0, { kind: "document", source: [] }); // Reserved for this iframe itself.
  const sourceObserver = new MutationObserver(() => {
    for (const [id, entry] of subscriptions) {
      if (entry.value.kind !== "document") continue;
      entry.dispose();
      open(id, entry.value);
    }
  });
  sourceObserver.observe(host, { attributes: true, attributeFilter: ["id", "name", "permission-scope"] });
  let loaded = false;
  const onLoad = () => {
    if (loaded) destroy(); // Self-navigation loses the previous document's access.
    loaded = true;
  };
  iframe.addEventListener("load", onLoad);
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    sourceObserver.disconnect();
    for (const id of subscriptions.keys()) close(id);
    iframe.removeEventListener("load", onLoad);
    connection.destroy();
  }
  return { destroy };
}
