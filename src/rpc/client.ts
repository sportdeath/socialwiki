import {
  Graffiti,
  type GraffitiObjectStream,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { CallOptions, connect, WindowMessenger } from "penpal";

// Send messages to the top-most window if there are nested iframes
const remoteWindow = window.top;
if (!remoteWindow) {
  throw new Error("Unable to talk to social wiki");
}

// Only send messages to the origin hosting the script
const allowedSrc = import.meta.url;
const allowedOrigin = new URL(allowedSrc).origin;

const messenger = new WindowMessenger({
  remoteWindow,
  allowedOrigins: [allowedOrigin],
});

type DiscoverResult = Awaited<ReturnType<GraffitiObjectStream<{}>["next"]>>;

type MethodsOf<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};
type Methods = MethodsOf<Graffiti> & {
  getMedia: (...args: Parameters<Graffiti["getMedia"]>) => Promise<{
    data: { buffer: ArrayBuffer; type: string };
    actor: string;
    allowed?: string[] | null;
  }>;
  postMedia: (
    media: {
      data: { buffer: ArrayBuffer; type: string };
      allowed?: string[] | null;
    },
    session: GraffitiSession,
  ) => Promise<string>;
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
    async streamReturn(id: string, value: DiscoverResult) {
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

  getMedia: Graffiti["getMedia"] = async (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const r = await remote;
    const result = await r.getMedia(...args);
    return {
      ...result,
      data: new Blob([result.data.buffer], { type: result.data.type }),
    };
  };

  postMedia: Graffiti["postMedia"] = async (...args) => {
    const [media, session] = args;
    const buffer = await media.data.arrayBuffer();
    const type = media.data.type;
    const r = await remote;
    return await r.postMedia(
      {
        ...JSON.parse(JSON.stringify(media)),
        data: { buffer, type },
      },
      JSON.parse(JSON.stringify(session)),
      new CallOptions({
        transferables: [buffer],
      }),
    );
  };

  // @ts-ignore
  discover: Graffiti["discover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const id = crypto.randomUUID();
    return (async function* () {
      const r = await remote;
      r.discover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          streams.set(id, resolve);
        });
        if (result.done) return result.value;
        yield result.value;
      }
    })();
  };
  // @ts-ignore
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const id = crypto.randomUUID();
    return (async function* () {
      const r = await remote;
      r.continueDiscover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          streams.set(id, resolve);
        });
        if (result.done) return result.value;
        yield result.value;
      }
    })();
  };

  readonly sessionEvents = sessionEvents;
}

declare global {
  interface Window {
    graffiti: typeof GraffitiSocialWiki;
  }
}

window.graffiti = GraffitiSocialWiki;
