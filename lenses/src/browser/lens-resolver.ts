import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { loadDocument } from "../../../kernel/src/bridges/resolution/document";
import { distributionUrl } from "../utils/distribution";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { nextTick, watch } from "vue";

const lensDirectories = {
  v: "view",
  e: "edit",
  h: "history",
} as const;

export type Lens = keyof typeof lensDirectories;

function isLens(value: string): value is Lens {
  return Object.hasOwn(lensDirectories, value);
}

function lensUrl(lens: Lens) {
  // This is the stable object identifier stored in Graffiti, not the URL used
  // to download the distribution's default lens.
  return `https://social.wiki/lenses/${lens}`;
}

function lensSchema() {
  return {
    properties: {
      value: {
        properties: {
          activity: { const: "Update" },
          object: {
            type: "string",
            enum: (Object.keys(lensDirectories) as Lens[]).map(lensUrl),
          },
          published: { type: "number" },
          source: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
        required: ["activity", "object", "published", "source"],
      },
    },
    required: ["value"],
  } as const satisfies JSONSchema;
}

async function loadDefaultLens(lens: Lens, signal?: AbortSignal) {
  // Keep default lenses and their assets in the same distribution as the browser.
  return loadDocument(
    new URL(`${lensDirectories[lens]}/index.html`, distributionUrl),
    signal,
  );
}

function latestLensSource(
  objects: Iterable<GraffitiObject<ReturnType<typeof lensSchema>>>,
  lens: Lens,
  actor: string,
) {
  let latest: GraffitiObject<ReturnType<typeof lensSchema>> | undefined;
  for (const object of objects) {
    if (object.actor !== actor || object.value.object !== lensUrl(lens))
      continue;
    if (
      !latest ||
      object.value.published > latest.value.published ||
      (object.value.published === latest.value.published &&
        object.url > latest.url)
    ) {
      latest = object;
    }
  }
  return latest?.value.source;
}

async function saveLensSource(
  graffiti: Graffiti,
  lens: Lens,
  source: string | null,
  session: GraffitiSession,
) {
  await graffiti.post<ReturnType<typeof lensSchema>>(
    {
      channels: [session.actor],
      allowed: [session.actor],
      value: {
        activity: "Update",
        object: lensUrl(lens),
        published: Date.now(),
        source,
      },
    },
    session,
  );
}

export function useLensSources(
  graffiti: Graffiti,
  session: () => GraffitiSession | null | undefined,
) {
  // One browser-owned query, not a discover per resolution. The Vue wrapper
  // also merges local posts/deletions into these results without polling.
  const baseSchema = lensSchema();
  const { objects, isFirstPoll } =
    useGraffitiDiscover<ReturnType<typeof lensSchema>>(
      () => {
        const actor = session()?.actor;
        return actor ? [actor] : [];
      },
      () =>
        ({
          ...baseSchema,
          properties: {
            ...baseSchema.properties,
            actor: { const: session()?.actor ?? "" },
          },
        }) as const,
      session,
    );

  async function waitUntilLoaded(signal?: AbortSignal) {
    // Let a session change reset the reactive query before reading its results.
    // Only initial discovery needs waiting; ordinary tab changes read memory.
    await nextTick();
    while (session() && isFirstPoll.value) {
      signal?.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const stop = watch([isFirstPoll, session], () => {
          stop();
          signal?.removeEventListener("abort", abort);
          resolve();
        });
        const abort = () => {
          stop();
          reject(signal?.reason);
        };
        signal?.addEventListener("abort", abort, { once: true });
      });
      await nextTick();
    }
    signal?.throwIfAborted();
  }

  async function getSource(lens: Lens, signal?: AbortSignal) {
    await waitUntilLoaded(signal);

    const actor = session()?.actor;
    const source = actor
      ? latestLensSource(objects.value, lens, actor)
      : undefined;

    return source ?? loadDefaultLens(lens, signal);
  }

  const resolveDocument = async (src: string, signal?: AbortSignal) => {
    const url = new URL(src, document.baseURI);
    if (!url.hash.startsWith("#/")) {
      throw new Error(`Could not resolve transclusion: ${src}`);
    }

    const { name: lens, query } = window.route.parseAddress(url.hash.slice(2));
    if (!isLens(lens)) throw new Error(`Unrecognized lens: ${lens}`);

    return {
      srcdoc: await getSource(lens, signal),
      query,
      status: "loading",
    };
  };

  return {
    getSource,
    resolveDocument,
    setSource(lens: Lens, source: string, currentSession: GraffitiSession) {
      return saveLensSource(graffiti, lens, source, currentSession);
    },
    async resetSource(lens: Lens, currentSession: GraffitiSession) {
      // Graffiti objects are immutable. A null source is an append-only reset
      // marker, leaving the earlier versions intact.
      await saveLensSource(graffiti, lens, null, currentSession);
      return loadDefaultLens(lens);
    },
  };
}

export type LensSources = ReturnType<typeof useLensSources>;
