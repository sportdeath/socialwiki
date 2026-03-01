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

export async function getTrustedActors(
  graffiti: Graffiti,
  session: GraffitiSession,
) {
  const results = new Map<string, AnnotationObject>();
  for await (const result of graffiti.discover<AnnotationSchema>(
    [session.actor],
    annotationSchema(["Trust", "Untrust"], { actor: session.actor }),
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

    if (
      !existing ||
      existing === true ||
      object.value.published > existing.value.published ||
      (object.value.published === existing.value.published &&
        object.value.activity !== "True")
    ) {
      latestByActor.set(actor, object);
    }
  }

  // Trusted actors are those whose latest decision is Trust.
  return latestByActor;
}
