<template>
    <button type="button" class="secondary" @click="toggleHandleReveal">
        {{
            revealHandlesEnabled
                ? "Use anonymized handles"
                : "Reveal handles (password)"
        }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";

const HANDLE_REVEAL_STORAGE_KEY = "socialwiki:disable-handle-anonymization:v1";
const HANDLE_REVEAL_PASSWORD = "badreview";

function readHandleRevealEnabled(): boolean {
    try {
        return window.localStorage.getItem(HANDLE_REVEAL_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function writeHandleRevealEnabled(enabled: boolean) {
    try {
        if (enabled) {
            window.localStorage.setItem(HANDLE_REVEAL_STORAGE_KEY, "1");
            return;
        }
        window.localStorage.removeItem(HANDLE_REVEAL_STORAGE_KEY);
    } catch {
        // Ignore localStorage errors in restricted contexts.
    }
}

const revealHandlesEnabled = ref(readHandleRevealEnabled());

function toggleHandleReveal() {
    if (revealHandlesEnabled.value) {
        revealHandlesEnabled.value = false;
        writeHandleRevealEnabled(false);
        return;
    }

    const password = window.prompt("Password required to reveal handles:");
    if (password === null) return;
    if (password !== HANDLE_REVEAL_PASSWORD) {
        window.alert("Incorrect password.");
        return;
    }

    revealHandlesEnabled.value = true;
    writeHandleRevealEnabled(true);
}
</script>
