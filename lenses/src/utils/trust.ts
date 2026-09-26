import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import type { TrustObject, TrustSchema } from "./schemas";

export async function trustActor(
  graffiti: Graffiti,
  actor: string,
  session: GraffitiSession,
  options?: {
    untrust?: boolean;
  },
) {
  const action = options?.untrust ? "Stop trusting editor" : "Trust editor";
  return await graffiti.post<TrustSchema>(
    {
      channels: [session.actor],
      value: {
        action,
        editor: actor,
        time: Date.now(),
      },
    },
    session,
  );
}

export function computeTrustAnnotationsByActor(
  trustAnnotations: TrustObject[],
  defaultActors: string[],
) {
  // Keep only the latest trust/untrust decision per actor.
  const latestByActor = new Map<string, TrustObject | true>(
    defaultActors.map((actor) => [actor, true]),
  );
  for (const object of trustAnnotations) {
    const actor = object.value.editor;
    const existing = latestByActor.get(actor);

    // A simultaneous Untrust wins; URLs break ties between matching actions.
    if (
      !existing ||
      existing === true ||
      object.value.time > existing.value.time ||
      (object.value.time === existing.value.time &&
        (object.value.action === "Stop trusting editor" &&
          existing.value.action !== "Stop trusting editor")) ||
      (object.value.time === existing.value.time &&
        object.value.action === existing.value.action &&
        object.url > existing.url)
    ) {
      latestByActor.set(actor, object);
    }
  }

  // Trusted actors are those whose latest decision is Trust.
  return latestByActor;
}

/** Return the actors whose latest decision is to trust them. */
export function trustedActors(
  annotations: Map<string, TrustObject | true>,
  actor?: string,
) {
  const trusted = new Set(
    [...annotations]
      .filter(
        ([, value]) => value === true || value.value.action === "Trust editor",
      )
      .map(([actor]) => actor),
  );
  if (actor) trusted.add(actor);
  return [...trusted];
}
