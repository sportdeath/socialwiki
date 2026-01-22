import {
  Graffiti,
  type GraffitiObjectStreamEntry,
  type GraffitiObjectStreamError,
  type GraffitiObjectStreamReturn,
  type GraffitiObjectStreamTombstone,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { connect, WindowMessenger } from "penpal";

const messenger = new WindowMessenger({
  remoteWindow: window.parent,
});

type DiscoverResult = IteratorResult<
  | GraffitiObjectStreamError
  | GraffitiObjectStreamTombstone
  | GraffitiObjectStreamEntry<{}>,
  GraffitiObjectStreamReturn<{}>
>;

type MethodsOf<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};
type Methods = MethodsOf<Graffiti> & {
  discover: (id: string, ...args: Parameters<Graffiti["discover"]>) => void;
  continueDiscover: (
    id: string,
    ...args: Parameters<Graffiti["continueDiscover"]>
  ) => void;
  initialize: () => void;
};

const sessionEvents = new EventTarget();
const streams = new Map<string, (result: DiscoverResult) => void>();
const connection = connect<Methods>({
  messenger,
  methods: {
    sessionEvent(type: string, detail: any) {
      sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
    },
    async streamReturn(
      id: string,
      value: IteratorResult<
        | GraffitiObjectStreamError
        | GraffitiObjectStreamTombstone
        | GraffitiObjectStreamEntry<{}>,
        GraffitiObjectStreamReturn<{}>
      >,
    ) {
      const stream = streams.get(id);
      if (!stream) return;
      stream(value);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  },
});

const remote = connection.promise;

const methods = [
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

class GraffitiSocialWiki {
  constructor() {
    for (const m of methods) {
      (this as any)[m] = async (...args: any[]) => {
        args = JSON.parse(JSON.stringify(args));
        const r = await remote;
        return r[m](...args);
      };
    }
    setTimeout(async () => (await remote).initialize(), 0);
  }

  // @ts-ignore
  discover: Graffiti["discover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const id = crypto.randomUUID();
    const this_ = this;
    return (async function* () {
      const r = await remote;
      r.discover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          streams.set(id, resolve);
        });
        if (result.done) {
          const cursor = result.value.cursor;
          return {
            cursor,
            continue: (session?: GraffitiSession | null) =>
              this_.continueDiscover(cursor, session),
          };
        }
        yield result.value;
      }
    })();
  };
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const id = crypto.randomUUID();
    const this_ = this;
    return (async function* () {
      const r = await remote;
      r.continueDiscover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          streams.set(id, resolve);
        });
        if (result.done) {
          const cursor = result.value.cursor;
          return {
            cursor,
            continue: (session?: GraffitiSession | null) =>
              this_.continueDiscover(cursor, session),
          };
        }
        yield result.value;
      }
    })();
  };

  readonly sessionEvents = sessionEvents;
}

declare global {
  interface Window {
    graffiti: GraffitiSocialWiki;
  }
}

window.graffiti = new GraffitiSocialWiki();
