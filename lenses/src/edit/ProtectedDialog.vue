<template>
    <DialogFrame v-model="open" label="Protected Page" @cancel="open = false">
        <h2 id="protected-title">Protected Page</h2>
        <ProtectionNotice
            :active-protection="activeProtection"
            :is-protection-by-session-actor="isProtectionBySessionActor"
            :active-protection-trust-source="activeProtectionTrustSource"
        />
        <p>
            You can still edit this page. However, others may not see your
            changes unless they mark <strong>you</strong> as a
            <a :href="trustedEditorsRoute">trusted editor</a>
            <em> or </em> one of their trusted editors endorses your changes.
        </p>
        <p>
            See this page's
            <a :href="historyRoute">History</a>
            and your
            <a :href="trustedEditorsRoute">trusted editors</a>
            for more information.
        </p>
        <footer>
            <button type="button" class="secondary" @click="emit('cancel')">
                Cancel
            </button>
            <button type="button" class="allow-button" @click="open = false">
                Continue to editor
            </button>
        </footer>
    </DialogFrame>
</template>
<script setup lang="ts">
import type { AnnotationObject } from "../utils/schemas";
import DialogFrame from "../utils/DialogFrame.vue";
import ProtectionNotice from "../utils/ProtectionNotice.vue";
const open = defineModel<boolean>({ required: true });
defineProps<{
    activeProtection: AnnotationObject | null;
    isProtectionBySessionActor: boolean;
    activeProtectionTrustSource: "default" | "trusted" | null;
    historyRoute: string;
}>();
const emit = defineEmits<{ cancel: [] }>();
const trustedEditorsRoute = "#/v?/trusted-editors";
</script>
