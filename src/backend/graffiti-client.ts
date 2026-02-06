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
  streamNext: (id: string) => ReturnType<GraffitiObjectStream<{}>["next"]>;
  streamReturn: (id: string) => void;
  initialize: () => void;
};

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

const sessionEvents = new EventTarget();
let remote_: Promise<RemoteProxy<Methods>> | undefined;
async function remote() {
  if (remote_) return remote_;

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
  const connection = connect<Methods>({
    messenger,
    // Establish callbacks for events
    methods: {
      sessionEvent(type: string, detail: any) {
        sessionEvents.dispatchEvent(new CustomEvent(type, { detail }));
      },
    },
  });
  remote_ = connection.promise;
  return remote_;
}

let isFirstClient = true;

// @ts-ignore - this implements Graffiti but the programmatic
// construction confuses the type checker.
export class GraffitiRpcClient extends Graffiti {
  readonly sessionEvents = sessionEvents;

  constructor() {
    super();

    if (isFirstClient) {
      isFirstClient = false;
      // Ask the "server" for a connection
      window.top?.postMessage("graffiti-init", "*");
      // Destroy that connection on close
      addEventListener("beforeunload", () => {
        window.top?.postMessage("graffiti-destroy", "*");
      });
    }

    // Bind all "simple" methods to their remote counterparts
    for (const m of simpleMethods) {
      (this as any)[m] = async (...args: any[]) => {
        args = JSON.parse(JSON.stringify(args));
        const r = await remote();
        return r[m](...args);
      };
    }

    // Wait for listeners to be added then initialize,
    // which will trigger session events to be sent.
    setTimeout(async () => (await remote()).initialize(), 0);
  }

  getMedia: Graffiti["getMedia"] = async (...args) => {
    args = JSON.parse(JSON.stringify(args));
    const r = await remote();
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
    const r = await remote();
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

  protected remoteStream(
    startStream: (r: RemoteProxy<Methods>, id: string) => Promise<void>,
  ): GraffitiObjectStream<{}> {
    const id = crypto.randomUUID();
    return (async function* () {
      try {
        const r = await remote();
        await startStream(r, id);
        while (true) {
          const result = await r.streamNext(id);
          if (result.done) return result.value;
          yield result.value;
        }
      } finally {
        const r = await remote();
        await r.streamReturn(id);
      }
    })();
  }

  // @ts-ignore
  discover: Graffiti["discover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    return this.remoteStream((r, id) => r.discover(id, ...args));
  };
  // @ts-ignore
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    args = JSON.parse(JSON.stringify(args));
    return this.remoteStream((r, id) => r.continueDiscover(id, ...args));
  };
}
