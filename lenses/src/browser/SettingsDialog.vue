<template>
    <DialogFrame
        v-model="open"
        class="settings-dialog"
        label="Settings"
        @cancel="open = false"
    >
        <h2>Settings</h2>
        <div class="settings-actions">
            <button
                v-if="loggedIn"
                type="button"
                class="warning"
                :disabled="busy"
                @click="emit('logout')"
            >
                {{ loggingOut ? "Logging out..." : "Log Out" }}
            </button>
            <button
                v-if="loggedIn"
                type="button"
                class="warning"
                :disabled="busy"
                @click="emit('reset')"
            >
                {{ resetting ? "Resetting..." : "Reset all lenses" }}
            </button>
            <button type="button" :disabled="busy" @click="emit('modify', 'v')">
                {{ modifying === "v" ? "Opening..." : "Modify View" }}
            </button>
            <button type="button" :disabled="busy" @click="emit('modify', 'e')">
                {{ modifying === "e" ? "Opening..." : "Modify Edit" }}
            </button>
            <button type="button" :disabled="busy" @click="emit('modify', 'h')">
                {{ modifying === "h" ? "Opening..." : "Modify History" }}
            </button>
        </div>
        <footer>
            <button type="button" class="secondary" @click="open = false">
                Close
            </button>
        </footer>
    </DialogFrame>
</template>
<script setup lang="ts">
import { computed } from "vue";
import DialogFrame from "../utils/DialogFrame.vue";
import type { Lens } from "../utils/lenses";
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
    loggedIn: boolean;
    loggingOut: boolean;
    resetting: boolean;
    modifying: Lens | null;
}>();
const busy = computed(
    () => props.loggingOut || props.resetting || props.modifying !== null,
);
const emit = defineEmits<{
    logout: [];
    reset: [];
    modify: [lens: Lens];
}>();
</script>
<style scoped>
.settings-dialog :deep(.dialog-panel) {
    width: min(30rem, calc(100vw - 2rem));
    font-size: 1.2rem;
}
.settings-dialog h2 {
    font-size: 1.6rem;
}
.settings-dialog footer {
    justify-content: flex-end;
}
.settings-actions {
    display: grid;
    gap: 0.5rem;
}

.settings-actions > button {
    width: 100%;
    text-align: left;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color-interactive);
    color: var(--text-color);
    padding: 0.45rem 0.65rem;
    text-decoration: none;
}

.settings-actions > button:hover {
    background: var(--background-color-interactive-hover);
    border-color: var(--border-color-hover);
    color: var(--text-color);
    text-decoration: none;
}

.settings-actions > button.secondary {
    color: var(--secondary-color);
}

.settings-actions > button.secondary:hover {
    color: var(--secondary-hover-color);
}

.settings-actions > button.warning {
    color: var(--warning-color);
    border-color: var(--warning-color);
}

.settings-actions > button.warning:hover {
    color: var(--warning-hover-color);
    border-color: var(--warning-hover-color);
}
</style>
