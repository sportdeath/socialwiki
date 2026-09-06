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

export async function getPageVersions(
  graffiti: Graffiti,
  pageName: string,
): Promise<PageVersionObject[]> {
  const versions = new Map<string, PageVersionObject>();
  for await (const result of graffiti.discover(
    [pageName],
    pageVersionSchema(pageName),
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

  return sortPageVersions([...versions.values()]);
}

export function sortPageVersions(
  versions: PageVersionObject[],
): PageVersionObject[] {
  // Topological sort via Kahn's algorithm:
  // - versions URLs are content addressed so versions are guaranteed to be acyclic
  // - edge A->B when A's URL is in B's precededBy.
  // - ties broken by self-reported published

  const nodes = new Map<
    string,
    {
      version: PageVersionObject;
      precededBy: string[];
      followedBy: string[];
    }
  >();
  for (const version of versions) {
    nodes.set(version.url, {
      version,
      precededBy: version.value.precededBy,
      followedBy: [],
    });
  }

  for (const [nodeUrl, node] of nodes) {
    // Dedupe predecessors and make sure they all exist
    node.precededBy = [...new Set(node.precededBy)].filter((p) => nodes.has(p));

    for (const predecessorUrl of node.precededBy) {
      const predecessor = nodes.get(predecessorUrl)!; // guaranteed to exist by above filter
      predecessor.followedBy.push(nodeUrl);
    }
  }

  // startNodes ← Set of all nodes with no incoming edge
  const queue = [...nodes.values()].filter(
    (node) => node.precededBy.length === 0,
  );

  // sortedList ← Empty list that will contain the sorted elements. This is what we will return.
  const sortedList: PageVersionObject[] = [];

  while (true) {
    // Sort the queue to resolve ambiguity between parallel branches
    queue.sort((a, b) => {
      const timeDifference =
        a.version.value.published - b.version.value.published;
      if (timeDifference !== 0) return timeDifference;

      // If the nodes have the timestamp, fallback to comparing
      // URLs to have a deterministic tie breaker
      return a.version.url < b.version.url ? -1 : 1;
    });

    // Start with the oldest item
    const current = queue.shift();
    if (!current) break; // queue empty! all done

    sortedList.push(current.version);

    for (const followerUrl of current.followedBy) {
      const follower = nodes.get(followerUrl);
      if (!follower) continue;
      follower.precededBy = follower.precededBy.filter(
        (url) => url !== current?.version.url,
      );
      if (follower.precededBy.length === 0) {
        queue.push(follower);
      }
    }
  }

  // Return in reverse chronological order
  return sortedList.toReversed();
}
