import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffitiGet,
} from "@graffiti-garden/wrapper-vue";
import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

const graffiti = useGraffiti();
const session = useGraffitiSession();

export const pageVersionContentSchema = {
  properties: {
    value: {
      properties: {
        content: { type: "string" },
      },
      required: ["content"],
    },
  },
} as const satisfies JSONSchema;
export type PageVersionContentSchema = typeof pageVersionContentSchema;

export function pageVersionSchema(pageChannel: string) {
  return {
    properties: {
      value: {
        properties: {
          pageChannel: {
            type: "string",
            const: pageChannel,
          },
          summary: { type: "string" },
          precededBy: {
            type: "array",
            items: {
              type: "string",
            },
          },
          contentUrl: { type: "string" },
          published: { type: "number" },
        },
        required: [
          "pageChannel",
          "summary",
          "precededBy",
          "contentUrl",
          "published",
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
) {
  if (!session.value) throw new Error("Not logged in");

  // First store the content
  const { url: contentUrl } = await graffiti.put<PageVersionContentSchema>(
    {
      channels: [],
      value: { content },
    },
    session.value,
  );

  // Now store the version metadata
  const result = await graffiti.put<PageVersionSchema>(
    {
      channels: [pageChannel],
      value: {
        pageChannel,
        summary,
        precededBy,
        contentUrl,
        published: Date.now(),
      },
    },
    session.value,
  );

  return result.url;
}

export async function deletePageVersion(object: PageVersionObject) {
  if (!session.value) throw new Error("Not logged in");
  await graffiti.delete(object.value.contentUrl, session.value);
  await graffiti.delete(object, session.value);
}

export function getPageVersions(pageChannel: MaybeRefOrGetter<string>) {
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
    isInitialPageVersionPolling: results.isInitialPolling,
  };
}

export function getPageVersionContent(
  pageVersionUrl: MaybeRefOrGetter<string | null | undefined>,
) {
  const result = useGraffitiGet(
    () => toValue(pageVersionUrl) ?? "",
    pageVersionContentSchema,
  );

  const content = computed(() => result.object.value?.value.content ?? "");
  return {
    content,
    poll: result.poll,
    isInitialPolling: result.isInitialPolling,
  };
}
