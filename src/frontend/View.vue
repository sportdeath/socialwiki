<template>
    <Header
        :pageName="pageName"
        @update:pageName="
            ($event) =>
                $router.push({ name: 'view', params: { pageName: $event } })
        "
    >
        <ul>
            <li>
                <RouterLink
                    :to="{
                        name: 'view',
                        params: { pageName },
                    }"
                    title="The current version of this page"
                >
                    View
                </RouterLink>
            </li>
            <li>
                <button
                    @click="editPage"
                    title="Edit the source code of this page"
                >
                    Edit
                </button>
            </li>
            <li>
                <RouterLink
                    :to="{
                        name: 'history',
                        params: { pageName },
                    }"
                    title="Past revisions of this page"
                >
                    History
                </RouterLink>
            </li>
            <li v-if="$graffitiSession.value === undefined">Loading...</li>
            <li v-else-if="$graffitiSession.value === null">
                <button @click="login" :disabled="loggingIn">
                    {{ loggingIn ? "Logging in..." : "Log In" }}
                </button>
            </li>
            <li v-else>
                <button
                    :class="{ selected: loggingOut }"
                    @click="logout($graffitiSession.value)"
                    class="secondary"
                >
                    {{ loggingOut ? "Logging out..." : "Log Out" }}
                </button>
            </li>
        </ul>
    </Header>
    <main>
        <sw-transclude
            v-if="!history"
            :src="`/w/${encodeURIComponent(pageName)}`"
            ref="transclude"
        ></sw-transclude>
        <History :pageName="pageName" ref="history" v-else></History>
    </main>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import Header from "./Header.vue";
import History from "./History.vue";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import { useRouter } from "vue-router";
const graffiti = useGraffiti();

const props = withDefaults(
    defineProps<{
        pageName: string;
        history?: boolean;
    }>(),
    {
        history: false,
    },
);

const router = useRouter();
const viewTransclude = useTemplateRef<HTMLElement>("transclude");
const historyComponent =
    useTemplateRef<InstanceType<typeof History>>("history");
const transclude = computed<HTMLElement | null | undefined>(() => {
    return props.history
        ? historyComponent.value?.transclude
        : viewTransclude.value;
});
function editPage() {
    const html = transclude.value?.getAttribute("srcdoc");
    if (html) {
        window.localStorage.setItem(
            `draft:${encodeURIComponent(props.pageName)}`,
            html,
        );
    }
    router.push({ name: "edit" });
}

const loggingIn = ref(false);
const loggingOut = ref(false);

function login() {
    loggingIn.value = true;
    graffiti.login().finally(() => {
        loggingIn.value = false;
    });
}
function logout(session: GraffitiSession) {
    loggingOut.value = true;
    graffiti.logout(session).finally(() => {
        loggingOut.value = false;
    });
}
</script>

<style>
nav .router-link-exact-active {
    text-decoration: underline 2px;
    color: var(--text-color);
}
nav .router-link-exact-active:hover {
    color: var(--text-color);
}
</style>
