import { computed } from "vue";
import {
  useGraffitiDiscover,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { defaultTrustedEditors } from "./default-trusted-editors";
import { trustSchema } from "./schemas";
import { computeTrustAnnotationsByActor, trustedActors } from "./trust";

export function useTrustContext() {
  const session = useGraffitiSession();
  const actor = computed(() => session.value?.actor);
  const sessionReady = computed(() => session.value !== undefined);
  // Trust belongs to the actor, so site navigation reuses this discovery.
  const { objects, isFirstPoll } = useGraffitiDiscover(
    () => (actor.value ? [actor.value] : []),
    () => trustSchema(actor.value),
  );
  const trustByActor = computed(() => {
    if (!sessionReady.value || (actor.value && isFirstPoll.value))
      return undefined;
    return computeTrustAnnotationsByActor(objects.value, defaultTrustedEditors);
  });
  const trustedEditors = computed(() => {
    if (!trustByActor.value) return undefined;
    return trustedActors(trustByActor.value, actor.value);
  });

  return { session, sessionReady, trustByActor, trustedEditors };
}
