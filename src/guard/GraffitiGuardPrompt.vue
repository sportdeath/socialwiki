<template>
    <aside v-if="activeGuardRequest" @click.self="rejectActive">
        <dialog open>
            <h2>{{ activeRequestTitle }}</h2>
            <section class="request-origin">
                <p class="request-page-name">
                    <span class="request-page-label muted">Page:</span>
                    <template v-if="activeRequestPageParts.length > 0">
                        <span class="transclude-name-path">
                            <template
                                v-for="(
                                    part, partIndex
                                ) in activeRequestPageParts"
                                :key="`${partIndex}:${part}`"
                            >
                                <span v-if="partIndex > 0" class="muted"
                                    >/</span
                                >
                                <span>{{ part }}</span>
                            </template>
                        </span>
                    </template>
                    <template v-else>
                        <span class="muted">(resolving transclude name)</span>
                    </template>
                </p>
                <button
                    v-if="
                        activeGuardRequest.transcludeId && !isPageVersionVisible
                    "
                    type="button"
                    class="secondary version-toggle"
                    :aria-expanded="isPageVersionVisible"
                    @click="togglePageVersion"
                >
                    Show page version
                </button>
                <p
                    v-if="
                        activeGuardRequest.transcludeId && isPageVersionVisible
                    "
                    class="transclude-version muted"
                    :title="activeGuardRequest.transcludeId"
                >
                    Page version:
                    {{ activeGuardRequest.transcludeId }}
                </p>
            </section>
            <template v-if="activeGuardRequest.method === 'post'">
                <ObjectDetails :object="activeGuardRequest.args[0] as any" />
            </template>
            <template v-else-if="activeGuardRequest.method === 'delete'">
                <GraffitiGet
                    :url="activeGuardRequest.args[0] as any"
                    :schema="{}"
                    :session="activeGuardRequest.args[1] as any"
                    v-slot="{ object }"
                >
                    <ObjectDetails :object="object" />
                </GraffitiGet>
            </template>
            <template v-else-if="activeGuardRequest.method === 'get'">
                <GraffitiGet
                    :url="activeGuardRequest.args[0] as any"
                    :schema="activeGuardRequest.args[1] as any"
                    :session="activeGuardRequest.args[2] as any"
                    v-slot="{ object }"
                >
                    <ObjectDetails :object="object" />
                </GraffitiGet>
            </template>
            <template v-else-if="activeGuardRequest.method === 'postMedia'">
                <MediaDetails :media="activeGuardRequest.args[0] as any" />
            </template>
            <template v-else-if="activeGuardRequest.method === 'deleteMedia'">
                <GraffitiGetMedia
                    :url="activeGuardRequest.args[0] as any"
                    :accept="{}"
                    :session="activeGuardRequest.args[1] as any"
                    v-slot="{ media }"
                >
                    <MediaDetails :media="media" />
                </GraffitiGetMedia>
            </template>
            <template v-else-if="activeGuardRequest.method === 'getMedia'">
                <GraffitiGetMedia
                    :url="activeGuardRequest.args[0] as any"
                    :accept="activeGuardRequest.args[1] as any"
                    :session="activeGuardRequest.args[2] as any"
                    v-slot="{ media }"
                >
                    <MediaDetails :media="media" />
                </GraffitiGetMedia>
            </template>
            <template v-else-if="activeGuardRequest.method === 'discover'">
                <DiscoverDetails
                    :channels="activeGuardRequest.args[0] as any"
                    :schema="activeGuardRequest.args[1] as any"
                />
            </template>
            <footer>
                <button @click="rejectActive" class="secondary">Cancel</button>
                <div class="split-button-menu">
                    <button @click="approveActive">Allow Once</button>
                    <details>
                        <summary>▾</summary>
                        <ul role="menu">
                            <!-- <li>
                                <button
                                    @click.prevent="approveActiveSimilar"
                                    role="menuitem"
                                    type="button"
                                >
                                    Allow All <em>Similar</em> Requests
                                </button>
                            </li> -->
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
    allowSimilarGraffitiGuardRequest,
    denyGraffitiGuardRequest,
    graffitiGuardState,
} from "./graffiti-guard";
import MediaDetails from "./MediaDetails.vue";
import ObjectDetails from "./ObjectDetails.vue";
import DiscoverDetails from "./DiscoverDetails.vue";

const activeGuardRequest = computed(
    () => graffitiGuardState.pending[0] ?? null,
);
const isPageVersionVisible = ref(false);

const activeRequestTitle = computed(() => {
    const request = activeGuardRequest.value;
    if (!request) return "";
    switch (request.method) {
        case "post":
            return "Allow this page to post data?";
        case "delete":
            return "Allow this page to delete data?";
        case "get":
            return "Allow this page to get private data?";
        case "postMedia":
            return "Allow this page to post a file?";
        case "deleteMedia":
            return "Allow this page to delete a file?";
        case "getMedia":
            return "Allow this page to access a private file?";
        case "discover":
            return "Allow this page to discover private data?";
        case "logout":
            return "Allow this page to log you out?";
        default:
            return "Allow this page?";
    }
});

function decodeTranscludeIdPath(path: string) {
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
        return decodeTranscludeIdPath(request.transcludeId);
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

function approveActiveSimilar() {
    const request = activeGuardRequest.value;
    if (!request) return;
    void allowSimilarGraffitiGuardRequest(request.id);
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

    .request-origin {
        display: grid;
        gap: 0.35rem;
    }

    .request-page-name {
        display: flex;
        align-items: baseline;
        gap: 0.3rem;
        flex-wrap: wrap;
        font-size: 1rem;
        line-height: 1.25;
    }

    .request-page-label {
        font-weight: 400;
    }

    .transclude-name-path {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.3rem;
        min-width: 0;
        font-weight: 700;
    }

    .transclude-name-path > span {
        word-break: break-word;
    }

    .transclude-version {
        margin: 0;
        min-width: 0;
        font-size: 0.85rem;
        line-height: 1.2;
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .version-toggle {
        justify-self: start;
        font-size: 0.85rem;
        line-height: 1.1;
    }

    .muted {
        color: var(--secondary-color);
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
