<template>
    <Header
        :pageName="address"
        @update:pageName="$router.push(`/${lens}/${$event}`)"
    >
        <ul>
            <li>
                <RouterLink
                    :to="`/view/${address}`"
                    title="The current version of this page"
                >
                    View
                </RouterLink>
            </li>
            <li>
                <RouterLink
                    :to="`/edit/${address}`"
                    title="Edit the source code of this page"
                >
                    Edit
                </RouterLink>
            </li>
            <li>
                <RouterLink
                    :to="`/history/${address}`"
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
            :src="`#/${lens}/${address}`"
            ref="transclude"
        ></sw-transclude>
    </main>
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watch } from "vue";
import Header from "./Header.vue";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import { useRouter } from "vue-router";
const graffiti = useGraffiti();

const props = defineProps<{
    lens: string;
    address: string;
}>();

// const router = useRouter();
// const transclude = useTemplateRef<HTMLElement>("transclude");
// function editPage() {
//     const html = transclude.value?.getAttribute("srcdoc");
//     const status = transclude.value?.getAttribute("status");
//     if (html && status === "ok") {
//         const draftKey = `draft:${props.pageName}`;
//         window.localStorage.setItem(draftKey, html);
//     }
//     router.push(`${props.pageName}/edit`);
// }

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
