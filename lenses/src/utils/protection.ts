import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import type { ProtectionObject, ProtectionSchema } from "./schemas";

export function sortProtectionHistory(
  annotations: ProtectionObject[],
  trustedActors: string[],
) {
  const trustedActorSet = new Set(trustedActors);
  const relevantAnnotations = annotations.filter(
    (a) =>
      trustedActorSet.has(a.actor) &&
      (a.value.action === "Protect site" || a.value.action === "Remove site protection"),
  );
  const protectUrls = new Set(
    relevantAnnotations
      .filter((a) => a.value.action === "Protect site")
      .map((a) => a.url),
  );

  return relevantAnnotations
    .filter(
      (a) =>
        a.value.action === "Protect site" || protectUrls.has(a.value["protection removed"]),
    )
    .sort((a, b) => {
      const aRemovesBProtection =
        a.value.action === "Remove site protection" &&
        b.value.action === "Protect site" &&
        a.value["protection removed"] === b.url &&
        a.value.time >= b.value.time;
      if (aRemovesBProtection) return 1;

      const bRemovesAProtection =
        b.value.action === "Remove site protection" &&
        a.value.action === "Protect site" &&
        b.value["protection removed"] === a.url &&
        b.value.time >= a.value.time;
      if (bRemovesAProtection) return -1;

      const timeDifference = a.value.time - b.value.time;
      if (timeDifference !== 0) return timeDifference;

      return a.url < b.url ? -1 : 1;
    })
    .reverse();
}

export async function updateSiteProtection(
  graffiti: Graffiti,
  siteName: string,
  isProtected: boolean,
  activeProtection: ProtectionObject | null | undefined,
  session: GraffitiSession,
) {
  if (isProtected) {
    if (!activeProtection) return;
    return await graffiti.post<ProtectionSchema>(
      {
        channels: [siteName],
        value: {
          action: "Remove site protection",
          "site name": siteName,
          "protection removed": activeProtection.url,
          time: Date.now(),
        },
      },
      session,
    );
  }

  return await graffiti.post<ProtectionSchema>(
    {
      channels: [siteName],
      value: {
        action: "Protect site",
        "site name": siteName,
        time: Date.now(),
      },
    },
    session,
  );
}
