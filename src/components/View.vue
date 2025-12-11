<template>
    <Header
        :channel="channel"
        @update:channel="($event) => (channelInput = $event)"
        @update:submit-channel="
            ($event) =>
                $router.push({ name: 'view', params: { channel: $event } })
        "
    >
        <ul v-if="$graffitiSession.value === undefined">
            <li>Loading...</li>
        </ul>
        <ul v-else-if="$graffitiSession.value === null">
            <li>
                <a
                    @click="historyOpen = false"
                    :class="{ selected: !historyOpen }"
                >
                    View
                </a>
            </li>
            <li>
                <button
                    @click="historyOpen = true"
                    title="Past revisions of this page"
                    :class="{ selected: historyOpen }"
                >
                    History
                </button>
            </li>
            <li>
                <button :class="{ selected: loggingIn }" @click="login">
                    {{ loggingIn ? "Logging in..." : "Log In" }}
                </button>
            </li>
        </ul>
        <ul v-else>
            <li>
                <a
                    @click="historyOpen = false"
                    :class="{ selected: !historyOpen }"
                >
                    View
                </a>
            </li>
            <li>
                <RouterLink
                    :to="{ name: 'edit', query: { existingHtml: html } }"
                    title="Edit the source code of this page"
                >
                    Edit
                </RouterLink>
            </li>
            <li>
                <button
                    @click="historyOpen = true"
                    title="Past revisions of this page"
                    :class="{ selected: historyOpen }"
                >
                    History
                </button>
            </li>
            <li>
                <button title="Add this page to your watchlist">⭐</button>
            </li>
            <li class="personal-menu">
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
                        {{ $graffitiSession.value.actor }}
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
                    <!-- Watchlist and contributions are uneditable pages -->
                    <li>
                        <a>Contributions</a>
                    </li>
                    <li>
                        <a>Watchlist</a>
                    </li>
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
    <main :class="{ stale: channelInput !== channel }">
        <DisplayPage v-if="!historyOpen" :html="html" />
        <TwoPaneLayout rightTitle="Preview" leftTitle="History" v-else>
            <template #left-pane>
                <History
                    :pageVersions="pageVersions"
                    v-model:selectedPageVersion="selectedPageVersion"
                />
            </template>
            <template #right-pane>
                <DisplayPage :html="html" />
            </template>
        </TwoPaneLayout>
    </main>
</template>

<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import Header from "./Header.vue";
import DisplayPage from "./DisplayPage.vue";
import TwoPaneLayout from "./TwoPaneLayout.vue";
import History from "./History.vue";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    getPageContentRef,
    getPageVersionsRef,
    type PageVersionObject,
} from "../graffiti/page-versions";

const props = defineProps<{
    channel: string;
}>();
const channel = toRef(props, "channel");
const channelInput = ref(channel.value);

const { pageVersions, isInitialPageVersionPolling } =
    getPageVersionsRef(channel);

const selectedPageVersion = ref<PageVersionObject | null>(null);
watch(channel, () => {
    selectedPageVersion.value = null;
});
// If we do not have a page version, use the latest one
watch(
    isInitialPageVersionPolling,
    async () => {
        // TODO: this is a horrible hack
        // Fix the wrapper-vue plugin!!
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (!selectedPageVersion.value) {
            selectedPageVersion.value = pageVersions.value[0] || null;
        }
    },
    { immediate: true },
);

const { pageContent: html } = getPageContentRef(
    () => selectedPageVersion.value?.value.contentUrl,
);

const personalMenuOpen = ref(false);
const historyOpen = ref(false);
const loggingIn = ref(false);
const loggingOut = ref(false);

const graffiti = useGraffiti();
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

.selected {
    text-decoration: underline 2px;
    color: var(--text-color);
}
.selected:hover {
    color: var(--text-color);
}

/* put a grey overlay over all the content */
.stale {
    position: relative;
    overflow: hidden;
}

.stale::before {
    content: "";
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    pointer-events: none;
}
</style>
