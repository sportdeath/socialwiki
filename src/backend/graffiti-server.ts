import { connect, Reply, WindowMessenger } from "penpal";
import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiObjectStream,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

export function serveGraffiti(): Graffiti {
  const graffiti = new GraffitiDecentralized();
  const loggedInActors = new Set<string>();
  graffiti.sessionEvents.addEventListener("login", (e) => {
    if (!(e instanceof CustomEvent)) return;
    const detail: GraffitiLoginEvent["detail"] = e.detail;
    if (detail.error) return;
    loggedInActors.add(detail.session.actor);
  });
  graffiti.sessionEvents.addEventListener("logout", (e) => {
    if (!(e instanceof CustomEvent)) return;
    const detail: GraffitiLogoutEvent["detail"] = e.detail;
    if (detail.error) return;
    loggedInActors.delete(detail.actor);
  });

  const served = new Map<Window, () => void>();
  const iteratorsByWindow = new Map<
    Window,
    Map<string, GraffitiObjectStream<{}>>
  >();
  async function serveGraffitiToWindow(window: Window) {
    const messenger = new WindowMessenger({
      remoteWindow: window,
      allowedOrigins: ["*"],
    });

    const simpleMethods = [
      "post",
      "get",
      "delete",
      "deleteMedia",
      "login",
      "logout",
      "actorToHandle",
      "handleToActor",
    ] as const;

    const iterators = new Map<string, GraffitiObjectStream<{}>>();
    iteratorsByWindow.set(window, iterators);

    const heartbeatIntervalMs = 500;
    const heartbeatTimeoutMs = 500;

    const connection = connect<{
      sessionEvent: (type: string, detail: any) => Promise<void>;
      ping: () => Promise<void>;
    }>({
      messenger,
      methods: {
        ...Object.fromEntries(
          simpleMethods.map((method) => [
            method,
            graffiti[method].bind(graffiti),
          ]),
        ),
        async postMedia(
          media: {
            data: { buffer: ArrayBuffer; type: string };
            allowed?: string[] | null;
          },
          session: GraffitiSession,
        ) {
          const data = new Blob([media.data.buffer], { type: media.data.type });
          return await graffiti.postMedia({ ...media, data }, session);
        },
        async getMedia(...args: Parameters<Graffiti["getMedia"]>) {
          const result = await graffiti.getMedia(...args);
          const buffer = await result.data.arrayBuffer();
          const type = result.data.type;

          return new Reply(
            {
              ...result,
              data: { buffer, type },
            },
            { transferables: [buffer] },
          );
        },
        async discover(id: string, ...args: Parameters<Graffiti["discover"]>) {
          const iterator = graffiti.discover<{}>(...args);
          iterators.set(id, iterator);
        },
        async continueDiscover(
          id: string,
          ...args: Parameters<Graffiti["continueDiscover"]>
        ) {
          const iterator = graffiti.continueDiscover<{}>(...args);
          iterators.set(id, iterator);
        },
        async streamNext(id: string) {
          const iterator = iterators.get(id);
          if (!iterator) return;
          return await iterator.next();
        },
        async streamReturn(id: string) {
          const iterator = iterators.get(id);
          if (!iterator) return;
          await iterator.return({ cursor: "" });
          iterators.delete(id);
        },
        initialize() {
          for (const actor of loggedInActors) {
            const loginEvent: GraffitiLoginEvent = new CustomEvent("login", {
              detail: { session: { actor } },
            });
            forward(loginEvent);
          }
          const initializedEvent: GraffitiSessionInitializedEvent =
            new CustomEvent("initialized");
          forward(initializedEvent);
        },
      },
    });

    // once connected, forward sessionEvents -> iframe sink
    const sessionEventTypes = ["login", "logout", "initialized"];
    const remote = await connection.promise;
    const forward = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      remote.sessionEvent(e.type, e.detail);
    };
    for (const type of sessionEventTypes) {
      graffiti.sessionEvents.addEventListener(type, forward);
    }

    let destroyed = false;
    let heartbeatTimer: number | undefined;
    const destroy = async () => {
      if (destroyed) return;
      destroyed = true;
      if (heartbeatTimer !== undefined) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      // Remove all listeners
      for (const type of sessionEventTypes) {
        graffiti.sessionEvents.removeEventListener(type, forward);
      }

      // Return all iterators to prevent locked queries
      const windowIterators = iteratorsByWindow.get(window);
      if (windowIterators) {
        const returns = [...windowIterators.values()].map((iterator) =>
          iterator.return({ cursor: "" }),
        );
        await Promise.allSettled(returns);
        windowIterators.clear();
        iteratorsByWindow.delete(window);
      }

      // Destroy the connection
      connection.destroy();
      served.delete(window);
    };

    const pingOrDestroy = async () => {
      try {
        await Promise.race([
          remote.ping(),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error("heartbeat timeout")),
              heartbeatTimeoutMs,
            );
          }),
        ]);
      } catch {
        await destroy();
      }
    };

    heartbeatTimer = setInterval(() => {
      void pingOrDestroy();
    }, heartbeatIntervalMs);
    served.set(window, destroy);
  }

  window.addEventListener("message", (event) => {
    if (!event.source) return;
    const window = event.source as Window;
    const message = event.data;
    if (message === "sw-graffiti-init") {
      serveGraffitiToWindow(window);
    } else if (message === "sw-graffiti-destroy") {
      const existing = served.get(window);
      void existing?.();
    }
  });

  return graffiti;
}
