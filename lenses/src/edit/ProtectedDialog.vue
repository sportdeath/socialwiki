<template>
    <DialogFrame v-model="open" label="Protected Site" @cancel="open = false">
        <h2 id="protected-title">Protected Site</h2>
        <ProtectionNotice
            :active-protection="activeProtection"
            :is-protection-by-session-actor="isProtectionBySessionActor"
            :active-protection-trust-source="activeProtectionTrustSource"
        />
        <p>
            You can still edit this site. However, others may not see your
            changes unless they mark <strong>you</strong> as a
            <a :href="trustedEditorsRoute">trusted editor</a>
            <em> or </em> one of their trusted editors endorses your changes.
        </p>
        <p>
            See this site's
            <a :href="historyRoute">History</a>
            and your
            <a :href="trustedEditorsRoute">trusted editors</a>
            for more information.
        </p>
        <footer>
            <a :href="viewRoute" class="secondary">
                Cancel
            </a>
            <button type="button" class="allow-button" @click="open = false">
                Continue to editor
            </button>
        </footer>
    </DialogFrame>
</template>
<script setup lang="ts">
import type { ProtectionObject } from "../utils/schemas";
import DialogFrame from "../utils/DialogFrame.vue";
import ProtectionNotice from "../utils/ProtectionNotice.vue";
const open = defineModel<boolean>({ required: true });
defineProps<{
    activeProtection: ProtectionObject | null;
    isProtectionBySessionActor: boolean;
    activeProtectionTrustSource: "default" | "trusted" | null;
    historyRoute: string;
    viewRoute: string;
}>();
const trustedEditorsRoute = "#/v?/trusted-editors";
</script>
