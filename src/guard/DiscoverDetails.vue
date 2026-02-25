<template>
    <details class="guard-details">
        <summary>Show Discover Details</summary>
        <dl v-if="channels || schema">
            <dt>Channels (where matching data may be found)</dt>
            <dd>
                <p v-if="!channels.length">
                    <em>No channels were specified.</em>
                </p>
                <ul v-else>
                    <li v-for="channel in channels" :key="channel">
                        <code>{{ channel }}</code>
                    </li>
                </ul>
            </dd>

            <dt>JSON Schema (filter for matching data)</dt>
            <dd>
                <pre>{{ JSON.stringify(schema, null, 2) }}</pre>
            </dd>
        </dl>
        <p v-else-if="channels === undefined && schema === undefined">
            <em>Loading...</em>
        </p>
        <p v-else>
            <em>Discover request details unavailable.</em>
        </p>
    </details>
</template>

<script setup lang="ts">
import "./details.css";

const { channels, schema } = defineProps<{
    channels: string[];
    schema: unknown;
}>();
</script>
