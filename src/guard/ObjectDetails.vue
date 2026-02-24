<template>
    <details>
        <summary>Show Data</summary>
        <dl v-if="object">
            <dt>Value</dt>
            <dd>
                <pre>{{ JSON.stringify(object.value, null, 2) }}</pre>
            </dd>
            <dt>Channels (where the object can be found)</dt>
            <dd>
                <p v-if="!object.channels.length">
                    <em>This object is not shared in any channels.</em>
                </p>
                <ul v-else>
                    <li v-for="channel in object.channels" :key="channel">
                        <code>{{ channel }}</code>
                    </li>
                </ul>
            </dd>
            <dt>Allowed (who can see the object)</dt>
            <dd>
                <p v-if="!Array.isArray(object.allowed)">
                    <em>Anyone is allowed to see the object</em>
                </p>
                <p v-else-if="object.allowed.length === 0">
                    <em>Only you are allowed to see the object</em>
                </p>
                <template v-else>
                    <p>
                        You and the following people are allowed to see the
                        object
                    </p>
                    <ul>
                        <li v-for="allowed in object.allowed" :key="allowed">
                            <dl>
                                <dt>Handle</dt>
                                <dd>
                                    <code
                                        ><GraffitiActorToHandle
                                            :actor="allowed"
                                    /></code>
                                </dd>
                                <dt>Actor</dt>
                                <dd>
                                    <code>{{ allowed }}</code>
                                </dd>
                            </dl>
                        </li>
                    </ul>
                </template>
            </dd>
            <template v-if="object.actor">
                <dt>Creator</dt>
                <dd>
                    <dl>
                        <dt>Handle</dt>
                        <dd>
                            <code>
                                <GraffitiActorToHandle :actor="object.actor" />
                            </code>
                        </dd>
                        <dt>Actor</dt>
                        <dd>
                            <code>{{ object.actor }}</code>
                        </dd>
                    </dl>
                </dd>
            </template>
            <template v-if="object.url">
                <dt>URL</dt>
                <dd>
                    <code>{{ object.url }}</code>
                </dd>
            </template>
        </dl>
        <p v-else-if="object === undefined">
            <em>Loading...</em>
        </p>
        <p v-else>
            <em>Object not found.</em>
        </p>
    </details>
</template>

<script setup lang="ts">
import type { GraffitiPostObject } from "@graffiti-garden/api";

const props = defineProps<{
    object: GraffitiPostObject<{}> | undefined | null;
}>();
</script>

<style scoped>
details {
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color);
    overflow: clip;
    font-size: 1rem;

    summary {
        display: list-item;
        cursor: pointer;
        padding: 0.5rem 0.75rem;
        background: var(--background-color-interactive);
        list-style-position: inside;
        font-size: 1.2rem;

        &:hover {
            background: var(--background-color-interactive-hover);
        }
    }

    > dl {
        padding: 0.75rem;
        > dd + dt {
            margin-top: 2rem;
        }
    }

    dt {
        font-size: 1rem;
        font-weight: 600;
    }

    dd {
        margin-left: 1rem;
        margin-top: 0.25rem;
        color: var(--secondary-color);
    }

    ul {
        margin: 0.5rem 0 0;
        padding-left: 1.1rem;
    }

    li + li {
        margin-top: 0.35rem;
    }

    dd > dl dt {
        font-size: 0.8rem;
        color: var(--text-color);
    }

    pre {
        margin: 0.5rem 0 0;
        overflow: auto;
        padding: 0.6rem 0.7rem;
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--background-color-interactive);
        color: var(--text-color);
        font-size: 0.85rem;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
    }

    code {
        display: inline-block;
        background: var(--background-color-interactive);
        padding: 0.15rem 0.3rem;
        border-radius: 0.3rem;
        border: 1px solid var(--border-color);
        color: var(--text-color);
        font-size: 0.85rem;
        word-break: break-all;
    }

    /* Long IDs/URLs should wrap instead of stretching the dialog. */
    dd {
        overflow-wrap: anywhere;
    }
}
</style>
