import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import type { TrustObject, TrustSchema } from "./schemas";

export async function trustActor(
  graffiti: Graffiti,
  actor: string,
  session: GraffitiSession,
) {
  return await graffiti.post<TrustSchema>(
    {
      channels: [session.actor],
      value: {
        activity: "Trust",
        account: actor,
        time: Date.now(),
      },
    },
    session,
  );
}

export async function untrustActor(
  graffiti: Graffiti,
  trusts: TrustObject[],
  session: GraffitiSession,
) {
  const deletions = await Promise.allSettled(
    trusts.map((trust) => graffiti.delete(trust, session)),
  );
  const failed = deletions.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

export function computeTrustAnnotationsByActor(
  trustAnnotations: TrustObject[],
  defaultActors: string[],
) {
  // Keep every record so removing trust can delete duplicates too.
  const byActor = new Map<string, TrustObject[] | true>(
    defaultActors.map((actor) => [actor, true]),
  );
  for (const object of trustAnnotations) {
    const actor = object.value.account;
    const existing = byActor.get(actor);
    byActor.set(
      actor,
      existing && existing !== true ? [...existing, object] : [object],
    );
  }
  return byActor;
}

/** Return actors with a current trust record or a built-in trust entry. */
export function trustedActors(
  annotations: Map<string, TrustObject[] | true>,
  actor?: string,
) {
  const trusted = new Set(annotations.keys());
  if (actor) trusted.add(actor);
  return [...trusted];
}
