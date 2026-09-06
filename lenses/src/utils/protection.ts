import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import type { AnnotationObject, AnnotationSchema } from "./schemas";

export function sortProtectionHistory(
  annotations: AnnotationObject[],
  trustedActors: string[],
) {
  const trustedActorSet = new Set(trustedActors);
  const relevantAnnotations = annotations.filter(
    (a) =>
      trustedActorSet.has(a.actor) &&
      (a.value.activity === "Protect" || a.value.activity === "Remove"),
  );
  const protectUrls = new Set(
    relevantAnnotations
      .filter((a) => a.value.activity === "Protect")
      .map((a) => a.url),
  );

  return relevantAnnotations
    .filter(
      (a) =>
        a.value.activity === "Protect" || protectUrls.has(a.value.object),
    )
    .sort((a, b) => {
      const aRemovesBProtection =
        a.value.activity === "Remove" &&
        b.value.activity === "Protect" &&
        a.value.object === b.url &&
        a.value.published >= b.value.published;
      if (aRemovesBProtection) return 1;

      const bRemovesAProtection =
        b.value.activity === "Remove" &&
        a.value.activity === "Protect" &&
        b.value.object === a.url &&
        b.value.published >= a.value.published;
      if (bRemovesAProtection) return -1;

      const timeDifference = a.value.published - b.value.published;
      if (timeDifference !== 0) return timeDifference;

      return a.url < b.url ? -1 : 1;
    })
    .reverse();
}

export async function updatePageProtection(
  graffiti: Graffiti,
  pageName: string,
  isProtected: boolean,
  activeProtection: AnnotationObject | null | undefined,
  session: GraffitiSession,
) {
  if (isProtected) {
    if (!activeProtection) return;
    return await graffiti.post<AnnotationSchema>(
      {
        channels: [pageName],
        value: {
          activity: "Remove",
          object: activeProtection.url,
          published: Date.now(),
        },
      },
      session,
    );
  }

  return await graffiti.post<AnnotationSchema>(
    {
      channels: [pageName],
      value: {
        activity: "Protect",
        object: pageName,
        published: Date.now(),
      },
    },
    session,
  );
}
