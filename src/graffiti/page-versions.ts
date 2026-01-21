import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { useGraffiti, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

const graffiti = useGraffiti();

export function pageVersionSchema(pageChannel: string) {
  return {
    properties: {
      value: {
        properties: {
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-update
          activity: { const: "Update" },
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-object-term
          object: {
            type: "string",
            const: pageChannel,
          },
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-published
          published: { type: "number" },
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-summary
          summary: { type: "string" },
          result: {
            type: "object",
            properties: {
              media: { type: "string" },
            },
            required: ["media"],
          },
          precededBy: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        required: [
          "activity",
          "object",
          "published",
          "summary",
          "result",
          "precededBy",
        ],
      },
    },
  } as const satisfies JSONSchema;
}
export type PageVersionSchema = ReturnType<typeof pageVersionSchema>;
export type PageVersionObject = GraffitiObject<PageVersionSchema>;

export async function createPageVersion(
  pageChannel: string,
  content: string,
  precededBy: string[],
  summary: string,
  session: GraffitiSession,
): Promise<PageVersionObject> {
  // First store the content
  const data = new Blob([content], { type: "text/html" });
  const media = await graffiti.postMedia({ data }, session);

  // Now store the version metadata
  return await graffiti.post<PageVersionSchema>(
    {
      channels: [pageChannel],
      value: {
        activity: "Update",
        object: pageChannel,
        published: Date.now(),
        summary,
        result: { media },
        precededBy,
      },
    },
    session,
  );
}

export async function deletePageVersion(
  object: PageVersionObject,
  session: GraffitiSession,
) {
  await graffiti.deleteMedia(object.value.result.media, session);
  await graffiti.delete(object, session);
}

export function getPageVersionsRef(
  pageChannel: MaybeRefOrGetter<string>,
  session?: GraffitiSession | null,
) {
  const results = useGraffitiDiscover(
    () => [toValue(pageChannel)],
    () => pageVersionSchema(toValue(pageChannel)),
  );

  const pageVersions = computed(() => {
    // TODO: properly topological sort using published
    // only to interleave disconnected components or to
    // find the "beginning" of cycles.
    return results.objects.value.toSorted(
      (a, b) => b.value.published - a.value.published,
    );
  });

  return {
    pageVersions,
    pollPageVersions: results.poll,
    isFirstPageVersionPoll: results.isFirstPoll,
  };
}
