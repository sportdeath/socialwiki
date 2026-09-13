import type {
  Graffiti,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { loadDocument } from "../../../kernel/src/bridges/resolution/document";
import { distributionUrl } from "../utils/distribution";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { nextTick, watch } from "vue";
import {
  createPageVersion,
  getPageVersions,
  pageVersionSchema,
  sortPageVersions,
  type PageVersionObject,
} from "../utils/page-versions";
import {
  isLens,
  lensDirectories,
  lenses,
  type Lens,
} from "../utils/lenses";

function lensSchema(actor: string) {
  return {
    anyOf: lenses.map(pageVersionSchema),
    properties: {
      actor: { const: actor },
    },
    required: ["actor", "value"],
  } as const satisfies JSONSchema;
}

async function loadDefaultLens(lens: Lens, signal?: AbortSignal) {
  // Keep default lenses and their assets in the same distribution as the browser.
  return loadDocument(
    new URL(`${lensDirectories[lens]}/index.html`, distributionUrl),
    signal,
  );
}

function lensVersions(
  objects: Iterable<PageVersionObject>,
  lens: Lens,
  actor: string,
) {
  return sortPageVersions(
    [...objects].filter(
      (object) =>
        object.actor === actor && object.value.object === lens,
    ),
  );
}

export function useLensSources(
  graffiti: Graffiti,
  session: () => GraffitiSession | null | undefined,
) {
  // One browser-owned query, not a discover per resolution. Explicit lens
  // publication advances its cursor before the new lens is resolved.
  const { objects, isFirstPoll, poll } = useGraffitiDiscover(
    () => (session() ? lenses : []),
    () => lensSchema(session()?.actor ?? ""),
    session,
  );
  const mediaCache = new Map<string, Promise<string>>();
  let refreshing: Promise<void> | undefined;

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
    await refreshing;
    signal?.throwIfAborted();

    const actor = session()?.actor;
    const version = actor
      ? lensVersions(objects.value as PageVersionObject[], lens, actor).at(0)
      : undefined;
    if (!version) return loadDefaultLens(lens, signal);

    const mediaAddress = version.value.result.media;
    let source = mediaCache.get(mediaAddress);
    if (!source) {
      source = graffiti
        .getMedia(mediaAddress, { types: ["text/html"] }, session())
        .then((media) => media.data.text());
      mediaCache.set(mediaAddress, source);
      void source.catch(() => mediaCache.delete(mediaAddress));
    }
    const html = await source;
    signal?.throwIfAborted();
    return html;
  }

  function refresh() {
    if (!refreshing) {
      refreshing = poll().finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
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
    refresh,
    resolveDocument,
    async reset(lens: Lens, currentSession: GraffitiSession) {
      const [source, versions] = await Promise.all([
        loadDefaultLens(lens),
        getPageVersions(graffiti, lens),
      ]);
      await createPageVersion(
        graffiti,
        lens,
        source,
        versions.map((version) => version.url),
        `Reset ${lensDirectories[lens]} lens to its default`,
        currentSession,
      );
    },
  };
}
