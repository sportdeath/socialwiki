import { connect, WindowMessenger } from "penpal";
import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
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
    "postMedia",
    "getMedia",
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
      async discover(id: string, ...args: Parameters<Graffiti["discover"]>) {
        const remote = await connection.promise;
        const iterator = graffiti.discover(...args);
        while (true) {
          const result = await iterator.next();
          await remote.streamReturn(id, result);
          if (result.done) break;
        }
      },
      async continueDiscover(
        id: string,
        ...args: Parameters<Graffiti["continueDiscover"]>
      ) {
        const remote = await connection.promise;
        const iterator = graffiti.continueDiscover(...args);
        while (true) {
          const result = await iterator.next();
          await remote.streamReturn(id, result);
          if (result.done) break;
        }
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
  // Forward initial session events
  setTimeout(() => {
    console.log("forwarding initial session events");
    for (const actor of loggedInActors) {
      console.log(actor);
      const loginEvent: GraffitiLoginEvent = new CustomEvent("login", {
        detail: { session: { actor } },
      });
      forward(loginEvent);
    }
    const initializedEvent: GraffitiSessionInitializedEvent = new CustomEvent(
      "initialized",
    );
    forward(initializedEvent);
    console.log("done");
  }, 0);

  return () => {
    for (const type of sessionEventTypes) {
      graffiti.sessionEvents.removeEventListener(type, forward);
    }
    connection.destroy();
  };
}
