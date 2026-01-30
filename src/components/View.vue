<template>
    <Header
        :channel="pageName"
        @update:channel="
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
                >
                    View
                </RouterLink>
            </li>
            <li v-if="$graffitiSession.value">
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
            <li v-else class="personal-menu">
                <button
                    :class="{ selected: personalMenuOpen }"
                    @click="personalMenuOpen = true"
                    title="Personal menu"
                >
                    👤▼
                </button>
                <ul
                    v-if="personalMenuOpen"
                    v-click-away="() => (personalMenuOpen = false)"
                >
                    <li>
                        <GraffitiActorToHandle
                            :actor="$graffitiSession.value.actor"
                        />
                    </li>
                    <li>
                        <RouterLink
                            :to="{
                                name: 'view',
                                params: {
                                    channel: `${$graffitiSession.value.actor}?actors=${$graffitiSession.value.actor}`,
                                },
                            }"
                            @click="personalMenuOpen = false"
                        >
                            My page
                        </RouterLink>
                    </li>
                    <!-- TODO: add contributions -->
                    <!-- <li>
                        <a>Contributions</a>
                    </li> -->
                    <li>
                        <button
                            :class="{ selected: loggingOut }"
                            @click="logout($graffitiSession.value)"
                        >
                            {{ loggingOut ? "Logging out..." : "Logout" }}
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
    </Header>
    <main>
        <social-wiki-transclude
            v-if="!history"
            :src="pageName"
            ref="transclude"
        ></social-wiki-transclude>
        <History :pageName="pageName" ref="history" v-else></History>
    </main>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import Header from "./Header.vue";
import History from "./History.vue";
import {
    useGraffiti,
    GraffitiActorToHandle,
} from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import { useRouter } from "vue-router";
const graffiti = useGraffiti();

const props = withDefaults(
    defineProps<{
        pageName: string;
        history: boolean;
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
    router.push({ name: "edit", params: { channel: props.pageName } });
}

const personalMenuOpen = ref(false);
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
        personalMenuOpen.value = false;
    });
}
</script>

<style>
.personal-menu {
    position: relative;
}

.personal-menu > ul {
    position: absolute;
    right: 0;
    top: calc(100%);
    text-align: right;
    z-index: 10;
    display: flex;
    list-style: none;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.router-link-active {
    text-decoration: underline 2px;
    color: var(--text-color);
}
.router-link-active:hover {
    color: var(--text-color);
}
</style>
