import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";

function normalizeEditors(editors?: string[]): string[] | undefined {
  if (!editors?.length) return;
  return [...new Set(editors)];
}

export function pageVersionSchema(pageChannel: string, editors?: string[]) {
  const normalizedEditors = normalizeEditors(editors);
  return {
    properties: {
      ...(normalizedEditors?.length
        ? {
            actor: {
              enum: normalizedEditors,
            },
          }
        : {}),
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
  graffiti: Graffiti,
  pageName: string,
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
      channels: [pageName],
      value: {
        activity: "Update",
        object: pageName,
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
  graffiti: Graffiti,
  object: PageVersionObject,
  session: GraffitiSession,
) {
  await graffiti.deleteMedia(object.value.result.media, session);
  await graffiti.delete(object, session);
}

export async function getPageVersions(
  graffiti: Graffiti,
  pageName: string,
  editors?: string[],
) {
  const versions = new Map<string, PageVersionObject>();
  const normalizedEditors = normalizeEditors(editors);
  for await (const result of graffiti.discover(
    [pageName],
    pageVersionSchema(pageName, normalizedEditors),
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (result.tombstone) {
      versions.delete(result.object.url);
    } else {
      versions.set(result.object.url, result.object);
    }
  }

  // TODO: properly topological sort using published
  // only to interleave disconnected components or to
  // find the "beginning" of cycles.
  return [...versions.values()].sort(
    (a, b) => b.value.published - a.value.published,
  );
}
