import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { withParentSource, type SourceSegment } from "../source";

type SessionWithSource = GraffitiSession & { source?: SourceSegment[] };

// TypeScript parameter types do not exist at runtime. Keep the session slots
// explicit so a sessionless schema containing `actor` is not mistaken for one.
const sessionArgumentIndex = new Map<keyof Graffiti, number>([
  ["post", 1],
  ["get", 2],
  ["delete", 1],
  ["discover", 2],
  ["continueDiscover", 1],
  ["postMedia", 1],
  ["getMedia", 2],
  ["deleteMedia", 1],
  ["logout", 0],
]);

function isSession(value: unknown): value is SessionWithSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<GraffitiSession>).actor === "string"
  );
}

export function withTranscludeSource(
  graffiti: Graffiti,
  host: HTMLElement,
): Graffiti {
  return new Proxy(graffiti, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== "function") return value;

      return (...originalArguments: unknown[]) => {
        const args = [...originalArguments];
        const index = sessionArgumentIndex.get(property as keyof Graffiti);
        const session = index === undefined ? undefined : args[index];

        if (index !== undefined && isSession(session)) {
          const childSource = Array.isArray(session.source)
            ? session.source
            : [];
          args[index] = {
            ...session,
            source: withParentSource(host, childSource),
          } satisfies SessionWithSource;
        }

        return Reflect.apply(value, target, args) as unknown;
      };
    },
  });
}

/** Install this realm's Graffiti connection across one iframe boundary. */
export function installGraffitiParent(
  iframe: HTMLIFrameElement,
  element: HTMLElement,
  graffiti: Graffiti,
) {
  const remoteWindow = iframe.contentWindow;
  if (!remoteWindow) {
    throw new Error("Transclude iframe did not create a content window");
  }

  const rpcHost = serveGraffiti(withTranscludeSource(graffiti, element));
  const connection = rpcHost.connect({ remoteWindow });
  return {
    async destroy() {
      await connection.destroy();
      await rpcHost.destroy();
    },
  };
}
