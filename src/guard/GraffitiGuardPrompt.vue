<template>
    <aside v-if="activeGuardRequest" @click.self="rejectActive">
        <dialog open>
            <template v-if="activeGuardRequest.method === 'post'">
                <h2>Allow this page to post data?</h2>

                <ObjectDetails :object="activeGuardRequest.args[0] as any" />
            </template>
            <template v-else-if="activeGuardRequest.method === 'delete'">
                <h2>Allow this page to delete data?</h2>
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
                <h2>Allow this page to access private data?</h2>

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
                <h2>Allow this page to post data?</h2>

                <!-- TODO: display media details -->
            </template>
            <template v-else-if="activeGuardRequest.method === 'deleteMedia'">
                <h2>Allow this page to delete data?</h2>

                <!-- TODO: display media details -->
            </template>
            <template v-else-if="activeGuardRequest.method === 'getMedia'">
                <h2>Allow this page to access private data?</h2>

                <!-- TODO: display media details -->
            </template>
            <template v-else-if="activeGuardRequest.method === 'discover'">
                <h2>Allow this page to access private data?</h2>

                <!-- TODO: display discovery request -->
            </template>
            <template v-else>
                <p>Unknown guard request:</p>
                <pre>{{ activeGuardRequest }}</pre>
            </template>
            <footer>
                <button @click="rejectActive" class="secondary">Cancel</button>
                <div class="split-button-menu">
                    <button @click="approveActive">Allow Once</button>
                    <details>
                        <summary>▾</summary>
                        <ul>
                            <li>
                                <button @click.prevent type="button">
                                    Allow for similar data
                                </button>
                            </li>
                            <li>
                                <button @click.prevent type="button">
                                    Allow <strong>Always</strong>
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
import { computed, ref } from "vue";
import {
    allowGraffitiGuardRequest,
    denyGraffitiGuardRequest,
    graffitiGuardState,
} from "./graffiti-guard";
import ObjectDetails from "./ObjectDetails.vue";

const activeGuardRequest = computed(
    () => graffitiGuardState.pending[0] ?? null,
);

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
</script>

<style scoped>
dialog {
    position: static;
    inset: auto;
    margin: 0;
    width: min(42rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: auto;
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

        & .split-button-menu > details[open] > ul {
            position: absolute;
            right: 0;
            top: calc(100% + 0.25rem);
            z-index: 1;
            margin: 0;
            padding: 0.25rem;
            min-width: 16rem;
            list-style: none;
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            background: var(--background-color);
            box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);
            font-size: 1rem;
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
    }
}

aside {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.2);
}
</style>
