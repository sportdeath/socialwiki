import {
  Graffiti,
  type GraffitiObjectStream,
  type GraffitiSession,
} from "@graffiti-garden/api";
import {
  CallOptions,
  connect,
  WindowMessenger,
  type RemoteProxy,
} from "penpal";

// Expect the server to supply all the methods of Graffiti,
// but postMedia, getMedia, discover, and continueDiscover
// are slightly modified to be able to send Blobs and AsyncGenerator types
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

type DiscoverResult = Awaited<ReturnType<GraffitiObjectStream<{}>["next"]>>;

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

export class GraffitiRpcClient {
  readonly sessionEvents = new EventTarget();

  // Plumbing to route object stream results
  // to the appropriate async generator
  protected readonly streams = new Map<
    string,
    (result: DiscoverResult) => void
  >();
  protected readonly remote: Promise<RemoteProxy<Methods>>;

  constructor() {
    // Send messages to the top-most window if there are nested iframes
    const remoteWindow = window.top;
    if (!remoteWindow) {
      throw new Error("Unable to talk to social wiki");
    }

    // Establish a connection to the serving window
    const messenger = new WindowMessenger({
      remoteWindow,
      allowedOrigins: ["*"],
    });
    const this_ = this;
    const connection = connect<Methods>({
      messenger,
      // Establish callbacks for events and asynchronous yields
      methods: {
        sessionEvent(type: string, detail: any) {
          this_.sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
        },
        async streamReturn(id: string, value: DiscoverResult) {
          const stream = this_.streams.get(id);
          if (!stream) return;
          stream(value);
          await new Promise((resolve) => setTimeout(resolve, 0));
        },
      },
    });
    this.remote = connection.promise;

    // Bind all "simple" methods to their remote counterparts
    for (const m of simpleMethods) {
      (this as any)[m] = async (...args: any[]) => {
        args = JSON.parse(JSON.stringify(args));
        const r = await this.remote;
        return r[m](...args);
      };
    }

    // Wait for listeners to be added then initialize,
    // which will trigger session events to be sent.
    setTimeout(async () => (await this.remote).initialize(), 0);
  }

  getMedia: Graffiti["getMedia"] = async (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const r = await this.remote;
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
    const r = await this.remote;
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
    const this_ = this;
    return (async function* () {
      const r = await this_.remote;
      r.discover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          this_.streams.set(id, resolve);
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
    const this_ = this;
    return (async function* () {
      const r = await this_.remote;
      r.continueDiscover(id, ...args);
      while (true) {
        const result = await new Promise<DiscoverResult>((resolve) => {
          this_.streams.set(id, resolve);
        });
        if (result.done) return result.value;
        yield result.value;
      }
    })();
  };
}
