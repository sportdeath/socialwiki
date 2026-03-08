<template>
    <aside v-if="activeGuardRequest" @click.self="rejectActive">
        <dialog open>
            <h2>{{ activeRequestTitle }}</h2>
            <GraffitiGuardPageIdentity
                :page-parts="activeRequestPageParts"
                :transclude-id="activeGuardRequest.transcludeId"
                :is-page-version-visible="isPageVersionVisible"
                @toggle-page-version="togglePageVersion"
            />
            <template v-if="activeGuardRequest.method === 'post'">
                <ObjectDetails
                    :object="activeGuardRequest.args[0] as any"
                    summary="Show Modification"
                    action="PUT"
                />
            </template>
            <template v-else-if="activeGuardRequest.method === 'delete'">
                <GraffitiGet
                    :url="activeGuardRequest.args[0] as any"
                    :schema="{}"
                    :session="activeGuardRequest.args[1] as any"
                    v-slot="{ object }"
                >
                    <ObjectDetails
                        :object="object"
                        summary="Show Modification"
                        action="DELETE"
                        :warning="true"
                    />
                </GraffitiGet>
            </template>
            <template v-else-if="activeGuardRequest.method === 'get'">
                <GraffitiGet
                    :url="activeGuardRequest.args[0] as any"
                    :schema="activeGuardRequest.args[1] as any"
                    :session="activeGuardRequest.args[2] as any"
                    v-slot="{ object }"
                >
                    <ObjectDetails
                        :object="object"
                        summary="Show Request"
                        action="GET"
                    />
                </GraffitiGet>
            </template>
            <template v-else-if="activeGuardRequest.method === 'postMedia'">
                <MediaDetails
                    :media="activeGuardRequest.args[0] as any"
                    summary="Show Modification"
                    action="PUT"
                />
            </template>
            <template v-else-if="activeGuardRequest.method === 'deleteMedia'">
                <GraffitiGetMedia
                    :url="activeGuardRequest.args[0] as any"
                    :accept="{}"
                    :session="activeGuardRequest.args[1] as any"
                    v-slot="{ media }"
                >
                    <MediaDetails
                        :media="media"
                        summary="Show Modification"
                        action="DELETE"
                        :warning="true"
                    />
                </GraffitiGetMedia>
            </template>
            <template v-else-if="activeGuardRequest.method === 'getMedia'">
                <GraffitiGetMedia
                    :url="activeGuardRequest.args[0] as any"
                    :accept="activeGuardRequest.args[1] as any"
                    :session="activeGuardRequest.args[2] as any"
                    v-slot="{ media }"
                >
                    <MediaDetails
                        :media="media"
                        summary="Show Request"
                        action="GET"
                    />
                </GraffitiGetMedia>
            </template>
            <template v-else-if="activeGuardRequest.method === 'discover'">
                <DiscoverDetails
                    :channels="activeGuardRequest.args[0] as any"
                    :schema="activeGuardRequest.args[1] as any"
                    summary="Show Request"
                />
            </template>
            <footer>
                <button @click="rejectActive" class="secondary">Cancel</button>
                <div class="split-button-menu">
                    <button @click="approveActive">Allow Once</button>
                    <details>
                        <summary>▾</summary>
                        <ul role="menu">
                            <li>
                                <button
                                    @click.prevent="approveActiveAlways"
                                    role="menuitem"
                                    type="button"
                                >
                                    Allow Forever (This Page Version Only)
                                </button>
                            </li>
                        </ul>
                    </details>
                </div>
            </footer>
        </dialog>
    </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    allowAlwaysGraffitiGuardRequest,
    allowGraffitiGuardRequest,
    denyGraffitiGuardRequest,
    graffitiGuardState,
} from "./graffiti-guard";
import MediaDetails from "./MediaDetails.vue";
import ObjectDetails from "./ObjectDetails.vue";
import DiscoverDetails from "./DiscoverDetails.vue";
import GraffitiGuardPageIdentity from "./GraffitiGuardPageIdentity.vue";
import { methodToCategory } from "./graffiti-guard-permission-categories";

const titleByCategory = {
    modify_data: "Allow this page to modify data?",
    access_private_data: "Allow this page to access private data?",
    logout: "Allow this page to log you out?",
} as const;

const activeGuardRequest = computed(
    () => graffitiGuardState.pending[0] ?? null,
);
const isPageVersionVisible = ref(false);

const activeRequestTitle = computed(() => {
    const request = activeGuardRequest.value;
    if (!request) return "";
    return titleByCategory[methodToCategory(request.method)];
});

function decodePath(path: string) {
    return path.split("/").map((part) => {
        try {
            return decodeURIComponent(part);
        } catch {
            return part;
        }
    });
}

const activeRequestPageParts = computed(() => {
    const request = activeGuardRequest.value;
    if (!request) return [];
    if (request.transcludeName && request.transcludeName.length > 0) {
        return request.transcludeName;
    }
    if (request.transcludeId) {
        return decodePath(request.transcludeId);
    }
    return [];
});

watch(
    () => activeGuardRequest.value?.id,
    () => {
        isPageVersionVisible.value = false;
    },
);

function togglePageVersion() {
    isPageVersionVisible.value = !isPageVersionVisible.value;
}

function approveActive() {
    const request = activeGuardRequest.value;
    if (!request) return;
    allowGraffitiGuardRequest(request.id);
}

function rejectActive() {
    const request = activeGuardRequest.value;
    if (!request) return;
    denyGraffitiGuardRequest(request.id);
}

function approveActiveAlways() {
    const request = activeGuardRequest.value;
    if (!request) return;
    void allowAlwaysGraffitiGuardRequest(request.id);
}
</script>

<style scoped>
dialog {
    position: static;
    inset: auto;
    margin: 0;
    width: min(42rem, calc(100vw - 2rem));
    overflow: visible;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color);
    color: var(--text-color);
    box-shadow: 0 0rem 2.5rem rgb(0 0 0 / 0.9);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 1.5rem;

    h2 {
        font-size: 2rem;
    }

    & h2,
    & p {
        margin: 0;
    }

    & footer {
        display: flex;
        justify-content: space-between;
        gap: 1rem;

        & .split-button-menu > details[open] > ul {
            position: absolute;
            right: 0;
            top: calc(100% + 0.25rem);
            z-index: 1;
            margin: 0;
            padding: 0.25rem;
            width: max-content;
            list-style: none;
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            background: var(--background-color);
            box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);
            font-size: inherit;
        }

        & .split-button-menu > details {
            position: relative;
        }

        & .split-button-menu details li {
            margin: 0;
        }

        & .split-button-menu details li button {
            width: 100%;
            text-align: left;
        }

        & .split-button-menu ul[role="menu"] > li > button[role="menuitem"] {
            color: inherit;
            padding: 0.25rem 0.35rem;
            border-radius: 0.5rem;
            cursor: pointer;
            text-decoration: none;
            white-space: nowrap;
            max-width: 70dvw;
            text-wrap: wrap;
        }

        &
            .split-button-menu
            ul[role="menu"]
            > li
            > button[role="menuitem"]:hover {
            background: var(--background-color-interactive);
            text-decoration: none;
        }

        &
            .split-button-menu
            ul[role="menu"]
            > li
            > button[role="menuitem"]:focus-visible {
            outline: 2px solid var(--border-color-hover);
            outline-offset: 0;
        }
    }
}

aside {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    justify-items: center;
    align-items: start;
    overflow: auto;
    padding: 1rem;
    background: rgb(0 0 0 / 0.2);
}
</style>
