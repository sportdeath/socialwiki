<template>
    <p>
        This site has been marked as
        <strong>protected</strong> by
        <template v-if="isProtectionBySessionActor">
            <strong>you</strong>.
        </template>
        <template v-else-if="activeProtection">
            <strong>
                <GraffitiActorToHandle
                    :actor="activeProtection.actor"
                /> </strong
            >,
            <template v-if="activeProtectionTrustSource === 'default'">
                a default
                <a :href="trustedEditorsRoute">trusted editor</a>.
            </template>
            <template v-else>
                an
                <a :href="trustedEditorsRoute">editor you trust</a>.
            </template>
        </template>
        <template v-else>a trusted editor.</template>
    </p>
</template>
<script setup lang="ts">
import type { ProtectionObject } from "./schemas";
import { GraffitiActorToHandle } from "@graffiti-garden/wrapper-vue";
defineProps<{
    activeProtection: ProtectionObject | null;
    isProtectionBySessionActor: boolean;
    activeProtectionTrustSource: "default" | "trusted" | null;
}>();
const trustedEditorsRoute = "#/v?/trusted-editors";
</script>
