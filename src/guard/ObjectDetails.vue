<template>
    <details class="guard-details">
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
import "./details.css";

const props = defineProps<{
    object: GraffitiPostObject<{}> | undefined | null;
}>();
</script>
