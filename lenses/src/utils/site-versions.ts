import type {
  Graffiti,
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { protectionSchema } from "./schemas";

export function siteVersionSchema(siteName: string) {
  return {
    properties: {
      value: {
        type: "object",
        properties: {
          action: { const: "Publish site" },
          "site name": { const: siteName },
          changes: { type: "string" },
          document: { type: "string" },
          "previous versions": { type: "array", items: { type: "string" } },
          time: { type: "number" },
        },
        required: ["action", "site name", "changes", "document", "time"],
      },
    },
    required: ["value"],
  } as const satisfies JSONSchema;
}

export type SiteVersionSchema = ReturnType<typeof siteVersionSchema>;
export type SiteVersionObject = GraffitiObject<SiteVersionSchema>;

// Existing publications remain discoverable under their original record URLs.
function legacySiteVersionSchema(siteChannel: string) {
  return {
    properties: {
      value: {
        properties: {
          activity: { const: "Update" },
          object: {
            type: "string",
            const: siteChannel,
          },
          published: { type: "number" },
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


export function siteVersionsSchema(siteName: string) {
  return {
    anyOf: [siteVersionSchema(siteName), legacySiteVersionSchema(siteName)],
  } as const satisfies JSONSchema;
}

/** Everything needed to choose the current version of a site. */
export function siteStateSchema(siteName: string) {
  return {
    anyOf: [siteVersionsSchema(siteName), protectionSchema(siteName)],
  } as const satisfies JSONSchema;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Read both publication formats into one view of the data. Keep the original
 * URL, author and access metadata: references and deletes use that identity.
 * Check complete shapes because JSON schemas allow unrelated extra fields.
 */
export function normalizeSiteVersions(
  objects: Iterable<GraffitiObjectBase>,
  siteName?: string,
): SiteVersionObject[] {
  const versions: SiteVersionObject[] = [];
  for (const object of objects) {
    const value = object.value as Record<string, unknown>;
    if (
      value.action === "Publish site" &&
      typeof value["site name"] === "string" &&
      (siteName === undefined || value["site name"] === siteName) &&
      typeof value.changes === "string" &&
      typeof value.document === "string" &&
      (value["previous versions"] === undefined || stringList(value["previous versions"])) &&
      typeof value.time === "number"
    ) {
      versions.push(object as SiteVersionObject);
      continue;
    }

    const result = value.result as { media?: unknown } | null | undefined;
    if (
      value.activity === "Update" &&
      typeof value.object === "string" &&
      (siteName === undefined || value.object === siteName) &&
      typeof value.summary === "string" &&
      typeof result === "object" && result !== null &&
      typeof result.media === "string" &&
      stringList(value.precededBy) &&
      typeof value.published === "number"
    ) {
      versions.push({
        ...object,
        value: {
          action: "Publish site",
          "site name": value.object,
          changes: value.summary,
          document: result.media,
          ...(value.precededBy.length ? { "previous versions": value.precededBy } : {}),
          time: value.published,
        },
      });
    }
  }
  return versions;
}

/**
 * Tips preserve causal history without listing every ancestor. Direct links to
 * versions with equal or later timestamps keep them before this publication
 * even if intermediate version metadata disappears.
 */
export function selectPreviousVersions(
  knownVersions: readonly SiteVersionObject[],
  time: number,
): string[] {
  const referenced = new Set<string>();
  for (const version of knownVersions) {
    for (const previous of version.value["previous versions"] ?? []) {
      referenced.add(previous);
    }
  }
  const selected = new Set<string>();
  for (const version of knownVersions) {
    if (!referenced.has(version.url) || version.value.time >= time) {
      selected.add(version.url);
    }
  }
  return [...selected];
}

export async function createSiteVersion(
  graffiti: Graffiti,
  siteName: string,
  content: string,
  knownVersions: readonly SiteVersionObject[],
  changes: string,
  session: GraffitiSession,
): Promise<SiteVersionObject> {
  const data = new Blob([content], { type: "text/html" });
  const document = await graffiti.postMedia({ data }, session);
  // Selection and the published record must use exactly the same timestamp.
  const time = Date.now();
  const previousVersions = selectPreviousVersions(knownVersions, time);
  return await graffiti.post<SiteVersionSchema>(
    {
      channels: [siteName],
      value: {
        action: "Publish site",
        "site name": siteName,
        changes,
        document,
        ...(previousVersions.length ? { "previous versions": previousVersions } : {}),
        time,
      },
    },
    session,
  );
}

export async function deleteSiteVersion(
  graffiti: Graffiti,
  object: SiteVersionObject,
  session: GraffitiSession,
) {
  await graffiti.deleteMedia(object.value.document, session);
  await graffiti.delete(object.url, session);
}

export async function getSiteVersions(
  graffiti: Graffiti,
  siteName: string,
): Promise<SiteVersionObject[]> {
  const versions = new Map<string, GraffitiObjectBase>();
  for await (const result of graffiti.discover(
    [siteName],
    siteVersionsSchema(siteName),
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (result.tombstone) versions.delete(result.object.url);
    else versions.set(result.object.url, result.object);
  }
  return sortSiteVersions(normalizeSiteVersions(versions.values(), siteName));
}

export function sortSiteVersions(
  versions: SiteVersionObject[],
): SiteVersionObject[] {
  // Topological sort via Kahn's algorithm:
  // - versions URLs are content addressed so versions are guaranteed to be acyclic
  // - edge A->B when A's URL is in B's previous versions.
  // - ties broken by self-reported time

  const nodes = new Map<
    string,
    {
      version: SiteVersionObject;
      precededBy: string[];
      followedBy: string[];
    }
  >();
  for (const version of versions) {
    nodes.set(version.url, {
      version,
      precededBy: version.value["previous versions"] ?? [],
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
  const sortedList: SiteVersionObject[] = [];

  while (true) {
    // Sort the queue to resolve ambiguity between parallel branches
    queue.sort((a, b) => {
      const timeDifference =
        a.version.value.time - b.version.value.time;
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

// If the site is not protected, choose the most recent version.
// Otherwise, choose the most recent version produced by a trusted actor.
export function pickVersion(
  siteVersions: SiteVersionObject[],
  trustedEditors: string[],
  isProtected: boolean,
) {
  if (!isProtected) return siteVersions.at(0) ?? null;
  return (
    siteVersions.find((version) => trustedEditors.includes(version.actor)) ??
    null
  );
}
