import { defaultTrustedEditors } from "./default-trusted-editors";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import {
  annotationSchema,
  type AnnotationObject,
  type AnnotationSchema,
} from "./schemas";

export async function trustActor(
  graffiti: Graffiti,
  actor: string,
  session: GraffitiSession,
  options?: {
    untrust?: boolean;
  },
) {
  const activity = options?.untrust ? "Untrust" : "Trust";
  return await graffiti.post<AnnotationSchema>(
    {
      channels: [session.actor],
      value: {
        activity,
        object: actor,
        published: Date.now(),
      },
    },
    session,
  );
}

async function discoverTrustContext(
  graffiti: Graffiti,
  actor: string,
) {
  const results = new Map<string, AnnotationObject>();
  for await (const result of graffiti.discover<AnnotationSchema>(
    [actor],
    annotationSchema(["Trust", "Untrust"], { actor }),
  )) {
    if (result.error) {
      console.error(result.error);
      continue;
    }
    if (result.tombstone) {
      results.delete(result.object.url);
    } else {
      results.set(result.object.url, result.object);
    }
  }

  return createTrustContext([...results.values()], actor);
}

const trustContextCache = new WeakMap<
  Graffiti,
  Map<string, ReturnType<typeof discoverTrustContext>>
>();

/**
 * Read an actor's trust decisions once per Graffiti connection. Trust is
 * independent of the page, so navigation within one lens can reuse it.
 */
export function getTrustContext(
  graffiti: Graffiti,
  session?: GraffitiSession | null,
) {
  if (!session) return Promise.resolve(createTrustContext([], undefined));

  let byActor = trustContextCache.get(graffiti);
  if (!byActor) {
    byActor = new Map();
    trustContextCache.set(graffiti, byActor);
  }

  const cached = byActor.get(session.actor);
  if (cached) return cached;

  const pending = discoverTrustContext(graffiti, session.actor);
  byActor.set(session.actor, pending);
  // A temporary failure should not poison future page loads.
  void pending.catch(() => {
    if (byActor.get(session.actor) === pending) byActor.delete(session.actor);
  });
  return pending;
}

function createTrustContext(
  annotations: AnnotationObject[],
  actor?: string,
) {
  const trustByActor = computeTrustAnnotationsByActor(
    annotations,
    defaultTrustedEditors,
  );
  return {
    trustByActor,
    trustedEditors: trustedActors(trustByActor, actor),
  };
}

export function computeTrustAnnotationsByActor(
  trustAnnotations: AnnotationObject[],
  defaultActors: string[],
) {
  // Keep only the latest trust/untrust decision per actor.
  const latestByActor = new Map<string, AnnotationObject | true>(
    defaultActors.map((actor) => [actor, true]),
  );
  for (const object of trustAnnotations) {
    const actor = object.value.object;
    const existing = latestByActor.get(actor);

    // A simultaneous Untrust wins; URLs break ties between matching actions.
    if (
      !existing ||
      existing === true ||
      object.value.published > existing.value.published ||
      (object.value.published === existing.value.published &&
        (object.value.activity === "Untrust" &&
          existing.value.activity !== "Untrust")) ||
      (object.value.published === existing.value.published &&
        object.value.activity === existing.value.activity &&
        object.url > existing.url)
    ) {
      latestByActor.set(actor, object);
    }
  }

  // Trusted actors are those whose latest decision is Trust.
  return latestByActor;
}

/** Shared trust policy; callers choose one-shot or reactive discovery. */
export function trustedActors(
  annotations: Map<string, AnnotationObject | true>,
  actor?: string,
) {
  const trusted = new Set(
    [...annotations]
      .filter(
        ([, value]) => value === true || value.value.activity === "Trust",
      )
      .map(([actor]) => actor),
  );
  if (actor) trusted.add(actor);
  return [...trusted];
}
