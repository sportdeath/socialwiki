import { connect, Reply, WindowMessenger, type Connection } from "penpal";
import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiObjectStream,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

export const graffiti = new GraffitiDecentralized();
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

async function stream(
  connection: Connection<{
    streamReturn: (id: string, value: any) => Promise<void>;
  }>,
  id: string,
  iterator: GraffitiObjectStream<{}>,
) {
  const remote = await connection.promise;
  while (true) {
    const result = await iterator.next();
    await remote.streamReturn(id, result);
    if (result.done) break;
  }
}

export async function serveGraffiti(iframe: HTMLIFrameElement) {
  if (!iframe.contentWindow) {
    throw new Error("iframe.contentWindow is not available");
  }

  const messenger = new WindowMessenger({
    remoteWindow: iframe.contentWindow,
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

  const connection = connect<{
    streamReturn: (id: string, value: any) => Promise<void>;
    sessionEvent: (type: string, detail: any) => Promise<void>;
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
        await stream(connection, id, iterator);
      },
      async continueDiscover(
        id: string,
        ...args: Parameters<Graffiti["continueDiscover"]>
      ) {
        const iterator = graffiti.continueDiscover<{}>(...args);
        await stream(connection, id, iterator);
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

  return () => {
    for (const type of sessionEventTypes) {
      graffiti.sessionEvents.removeEventListener(type, forward);
    }
    connection.destroy();
  };
}
