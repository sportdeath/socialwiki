import { GraffitiActorToHandle } from "@graffiti-garden/wrapper-vue";
import { defineComponent } from "vue";

function setupProtectionNotice() {
  const trustedEditorsRoute = "#/v?/trusted-editors";
  return { trustedEditorsRoute };
}

export default defineComponent({
  template: "#protection-notice-template",
  props: {
    activeProtection: {},
    isProtectionBySessionActor: Boolean,
    activeProtectionTrustSource: {},
  },
  components: { GraffitiActorToHandle },
  setup: setupProtectionNotice,
});
