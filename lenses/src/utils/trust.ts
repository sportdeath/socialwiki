import { defaultTrustedEditors } from "./default-trusted-editors";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import {
  trustSchema,
  type TrustObject,
  type TrustSchema,
} from "./schemas";

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

async function discoverTrustContext(
  graffiti: Graffiti,
  actor: string,
) {
  const results = new Map<string, TrustObject>();
  for await (const result of graffiti.discover<TrustSchema>(
    [actor],
    trustSchema(actor),
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
 * independent of the site, so navigation within one lens can reuse it.
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
  // A temporary failure should not poison future site loads.
  void pending.catch(() => {
    if (byActor.get(session.actor) === pending) byActor.delete(session.actor);
  });
  return pending;
}

function createTrustContext(
  annotations: TrustObject[],
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

/** Shared trust policy; callers choose one-shot or reactive discovery. */
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
