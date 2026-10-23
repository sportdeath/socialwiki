import type { GraffitiObject, GraffitiObjectBase, JSONSchema } from "@graffiti-garden/api";

export function versionSchema(siteName: string, actors: string[]) {
  return {
    properties: {
      actor: { enum: actors },
      value: {
        type: "object",
        required: ["action", "site name", "changes", "document", "time"],
        properties: {
          action: { const: "Publish site" },
          "site name": { const: siteName },
          changes: { type: "string" },
          document: { type: "string" },
          time: { type: "number" },
          "previous versions": { type: "array", items: { type: "string" } },
        },
      },
    },
    required: ["actor", "value"],
  } as const satisfies JSONSchema;
}

export type SiteVersion = GraffitiObject<ReturnType<typeof versionSchema>>;

export function versionFollowSchema(actor: string) {
  return {
    properties: {
      actor: { const: actor },
      allowed: { type: "array", maxItems: 0 },
      value: {
        type: "object",
        properties: {
          action: { const: "Follow site admin versions" },
          "my version": { type: "string" },
        },
        required: ["action", "my version"],
      },
    },
    required: ["actor", "allowed", "value"],
  } as const satisfies JSONSchema;
}

export type VersionFollow = GraffitiObject<ReturnType<typeof versionFollowSchema>>;

export function isSiteVersion(object: GraffitiObjectBase): object is SiteVersion {
  return (object.value as { action?: unknown }).action === "Publish site";
}

export function isVersionFollow(object: GraffitiObjectBase): object is VersionFollow {
  return (object.value as { action?: unknown }).action === "Follow site admin versions";
}

export function followsOwnVersion(
  records: readonly GraffitiObjectBase[],
  myVersionUrl: string | undefined,
): boolean {
  return myVersionUrl !== undefined && records.some(
    (record) => isVersionFollow(record) && record.value["my version"] === myVersionUrl,
  );
}

// Respect publication history first, then order independent branches by time.
export function newestFirst(versions: SiteVersion[]): SiteVersion[] {
  const byUrl = new Map(versions.map((version) => [version.url, version]));
  const parents = new Map<string, number>();
  const children = new Map(versions.map((version) => [version.url, [] as string[]]));
  for (const version of versions) {
    const knownParents = [...new Set(version.value["previous versions"] || [])]
      .filter((url) => byUrl.has(url));
    parents.set(version.url, knownParents.length);
    for (const url of knownParents) children.get(url)!.push(version.url);
  }
  const ready = versions.filter((version) => parents.get(version.url) === 0);
  const ordered: SiteVersion[] = [];
  while (ready.length) {
    ready.sort((a, b) => a.value.time - b.value.time || a.url.localeCompare(b.url));
    const version = ready.shift()!;
    ordered.push(version);
    for (const childUrl of children.get(version.url)!) {
      const remaining = parents.get(childUrl)! - 1;
      parents.set(childUrl, remaining);
      if (remaining === 0) ready.push(byUrl.get(childUrl)!);
    }
  }
  return ordered.reverse();
}
