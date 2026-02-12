import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";

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

export async function getPageVersions(graffiti: Graffiti, pageName: string): Promise<PageVersionObject[]> {
  const versions: PageVersionObject[] = [];
  for await (const result of graffiti.discover(
    [pageName],
    pageVersionSchema(pageName),
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (!result.tombstone) {
      versions.push(result.object);
    }
  }

  return topoSortPageVersions(versions);
}

export function topoSortPageVersions(versionsRaw: PageVersionObject[]): PageVersionObject[] {
  // Topological sort via Kahn's algorithm: edge A->B when A's URL is in B's precededBy.
  // Guaranteed acyclic.
  // Guaranteed that elements in precededBy are in versions??
  // Ties broken by published (newest first).

  const versions = new Map<string, PageVersionObject>();
  for (const version of versionsRaw) {
    versions.set(version.url, version);
  }

  // Compute indegrees and adjacency list of outgoing edges.
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of versions.values()) {
    indegree.set(node.url, node.value.precededBy.length);
    adj.set(node.url, []);
  }

  for (const target of versions.values()) {
    for (const source of target.value.precededBy) {
      adj.get(source)!.push(target.url); // Questionable. Is source certainly in versions? If not, we can't do much.
    }
  }

  // L ← Empty list that will contain the sorted elements. This is what we will return.
  const L: PageVersionObject[] = [];

  // S ← Set of all nodes with no incoming edge
  const urls = [...versions.keys()];
  let S = urls.filter((u) => indegree.get(u) === 0);

  // Tie-breaker: newest first.
  S.sort(
    (a, b) =>
      (versions.get(b)?.value.published ?? 0) -
      (versions.get(a)?.value.published ?? 0),
  );

  while (S.length > 0) {
    const n = S.shift()!;
    const obj = versions.get(n)!; // We want the full PageVersionObject, not just the url.
    L.push(obj);

    for (const m of adj.get(n)!) {
      const d = indegree.get(m)! - 1;
      indegree.set(m, d);
      if (d === 0) S.push(m);
    }
  }

  const hasCycle = urls.some((u) => (indegree.get(u)! > 0));
  if (hasCycle) {
    // Should never happen.
    console.error("Page version graph has a cycle; topological sort impossible");
    return [];
  }

  return L;
}
