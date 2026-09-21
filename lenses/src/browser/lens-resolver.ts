import type {
  Graffiti,
  GraffitiObjectBase,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { loadDocument } from "../../../kernel/src/bridges/resolution/document";
import { lensesUrl } from "../utils/locator";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { nextTick, ref, watch } from "vue";
import {
  deleteSiteVersion,
  siteVersionsSchema,
  normalizeSiteVersions,
  sortSiteVersions,
} from "../utils/site-versions";
import {
  lensDirectories,
  lenses,
  type Lens,
} from "../utils/lenses";

function lensSchema(actor: string) {
  return {
    anyOf: lenses.map(siteVersionsSchema),
    properties: {
      actor: { const: actor },
    },
    required: ["actor", "value"],
  } as const satisfies JSONSchema;
}

async function loadDefaultLens(lens: Lens, signal?: AbortSignal) {
  // Keep default lenses and their assets in the same distribution as the browser.
  return loadDocument(
    new URL(`${lensDirectories[lens]}/index.html`, lensesUrl),
    signal,
  );
}

function lensVersions(
  objects: Iterable<GraffitiObjectBase>,
  lens: Lens,
  actor: string,
) {
  return sortSiteVersions(
    normalizeSiteVersions(objects, lens).filter((object) => object.actor === actor),
  );
}

export function useLensSources(
  graffiti: Graffiti,
  session: () => GraffitiSession | null | undefined,
) {
  // Keep one browser-owned query rather than starting a discovery for every
  // resolution. Reset explicitly advances its cursor after deleting versions.
  const { objects, isFirstPoll, poll } = useGraffitiDiscover(
    () => (session() ? lenses : []),
    () => lensSchema(session()?.actor ?? ""),
    session,
  );
  const revision = ref(0);
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
      ? lensVersions(
          objects.value,
          lens,
          actor,
        ).at(0)
      : undefined;
    if (!version) return loadDefaultLens(lens, signal);

    const mediaAddress = version.value.document;
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
    return {
      srcdoc: await getSource("v", signal),
      query: src.startsWith("?")
        ? src
        : window.route.composeQuery(undefined, src),
    };
  };

  return {
    getSource,
    isModified(lens: Lens) {
      const actor = session()?.actor;
      return actor
        ? lensVersions(
            objects.value,
            lens,
            actor,
          ).length > 0
        : false;
    },
    resolveDocument,
    revision,
    async reset(lens: Lens, currentSession: GraffitiSession) {
      await waitUntilLoaded();
      const versions = lensVersions(
        objects.value,
        lens,
        currentSession.actor,
      );

      await Promise.all(
        versions.map(async (version) => {
          await deleteSiteVersion(graffiti, version, currentSession);
          mediaCache.delete(version.value.document);
        }),
      );
      await refresh();
      revision.value++;
    },
  };
}

export type LensSources = ReturnType<typeof useLensSources>;
