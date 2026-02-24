<template>
    <div v-if="activeGuardRequest" class="guard-banner" role="alert">
        <div class="guard-banner-copy">
            <strong> Confirm Action </strong>
            <span>
                <code>{{ activeGuardRequest.method }}</code> from a sandboxed
                page
                <template v-if="formattedGuardSourceId">
                    (<code>{{ formattedGuardSourceId }}</code>)
                </template>
                <template v-if="pendingGuardCount > 1">
                    ({{ pendingGuardCount - 1 }} more queued)
                </template>
            </span>
        </div>
        <div class="guard-banner-actions">
            <button
                class="secondary"
                @click="toggleGuardDetails(activeGuardRequest.id)"
            >
                {{ guardDetailsOpen ? "Hide details" : "View details" }}
            </button>
            <button
                class="secondary"
                @click="denyGuardRequest(activeGuardRequest.id)"
            >
                Deny
            </button>
            <button @click="allowGuardRequest(activeGuardRequest.id)">
                Allow
            </button>
        </div>
    </div>
    <section
        v-if="activeGuardRequest && guardDetailsOpen"
        class="guard-details"
    >
        <h2>Guard Request Details</h2>
        <p>
            <strong>Method:</strong>
            {{ activeGuardRequest.method }}
        </p>
        <p>
            <strong>Source:</strong>
            <code>{{ formattedGuardSourceId ?? "untracked" }}</code>
        </p>
        <pre>{{ formattedGuardArgs }}</pre>
    </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    allowGraffitiGuardRequest,
    denyGraffitiGuardRequest,
    graffitiGuardState,
} from "./graffiti-guard";

const activeGuardRequest = computed(() => graffitiGuardState.pending[0]);
const pendingGuardCount = computed(() => graffitiGuardState.pending.length);
const openGuardDetailsForId = ref<number | null>(null);
const guardDetailsOpen = computed(
    () =>
        activeGuardRequest.value !== undefined &&
        openGuardDetailsForId.value === activeGuardRequest.value.id,
);
watch(activeGuardRequest, (request) => {
    if (!request) {
        openGuardDetailsForId.value = null;
        return;
    }

    if (openGuardDetailsForId.value === null) {
        openGuardDetailsForId.value = request.id;
    }
});

function toggleGuardDetails(id: number) {
    openGuardDetailsForId.value =
        openGuardDetailsForId.value === id ? null : id;
}
function allowGuardRequest(id: number) {
    allowGraffitiGuardRequest(id);
}
function denyGuardRequest(id: number) {
    denyGraffitiGuardRequest(id);
}
function guardJsonReplacer(_key: string, value: unknown) {
    if (value instanceof ArrayBuffer) {
        return `[ArrayBuffer ${value.byteLength} bytes]`;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
        return `[Blob ${value.type || "application/octet-stream"} ${value.size} bytes]`;
    }
    if (value instanceof HTMLElement) {
        return `[HTMLElement ${value.tagName.toLowerCase()}]`;
    }
    return value;
}

const formattedGuardArgs = computed(() => {
    const request = activeGuardRequest.value;
    if (!request) return "";
    try {
        return JSON.stringify(request.args, guardJsonReplacer, 2);
    } catch {
        return String(request.args);
    }
});

const formattedGuardSourceId = computed(() => {
    const request = activeGuardRequest.value;
    if (!request || request.transcludeId === null) return null;
    return request.transcludeId;
});
</script>

<style>
.guard-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
    background: color-mix(
        in srgb,
        var(--background-color-interactive) 70%,
        #ffcc66 30%
    );
}

.guard-banner-copy {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.guard-banner-copy span {
    font-size: 0.9rem;
}

.guard-banner-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.guard-details {
    border-bottom: 1px solid var(--border-color);
    padding: 0.75rem;
    background: var(--background-color-interactive);

    h2 {
        margin: 0;
        font-size: 1rem;
    }

    p {
        margin: 0.5rem 0 0;
    }

    pre {
        margin: 0.5rem 0 0;
        max-height: 18rem;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.8rem;
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem;
        background: var(--background-color);
    }
}

@media (max-width: 699px) {
    .guard-banner {
        flex-direction: column;
        align-items: stretch;
    }
    .guard-banner-actions {
        justify-content: flex-end;
    }
}
</style>
