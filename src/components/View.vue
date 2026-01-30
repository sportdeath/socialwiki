<template>
    <Header
        :channel="channel"
        @update:channel="
            ($event) =>
                $router.push({ name: 'view', params: { channel: $event } })
        "
    >
        <ul>
            <li>
                <a
                    @click="historyOpen = false"
                    :class="{ selected: !historyOpen }"
                >
                    View
                </a>
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
                <button
                    @click="historyOpen = true"
                    title="Past revisions of this page"
                    :class="{ selected: historyOpen }"
                >
                    History
                </button>
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
            :src="channel"
            ref="transclude"
        ></social-wiki-transclude>
    </main>
</template>

<script setup lang="ts">
import { ref, toRef, useTemplateRef, watch } from "vue";
import Header from "./Header.vue";
// import TwoPaneLayout from "./TwoPaneLayout.vue";
// import History from "./History.vue";
import {
    useGraffiti,
    GraffitiActorToHandle,
} from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import { useRouter } from "vue-router";
const graffiti = useGraffiti();

const props = defineProps<{
    channel: string;
}>();
const channel = toRef(props, "channel");

const router = useRouter();
const transclude = useTemplateRef<HTMLElement>("transclude");
function editPage() {
    const html = transclude.value?.getAttribute("srcdoc");
    if (html) {
        window.localStorage.setItem(
            `draft:${encodeURIComponent(channel.value)}`,
            html,
        );
    }
    router.push({ name: "edit" });
}

const personalMenuOpen = ref(false);
const historyOpen = ref(false);
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

.selected {
    text-decoration: underline 2px;
    color: var(--text-color);
}
.selected:hover {
    color: var(--text-color);
}
</style>
