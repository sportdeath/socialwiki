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
                :disabled="loggingOut"
                @click="emit('logout')"
            >
                {{ loggingOut ? "Logging out..." : "Log Out" }}
            </button>
            <button type="button" @click="emit('edit', 'v')">
                Modify View
            </button>
            <button type="button" @click="emit('edit', 'e')">
                Modify Edit
            </button>
            <button type="button" @click="emit('edit', 'h')">
                Modify History
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
import DialogFrame from "../utils/DialogFrame.vue";
import type { Lens } from "./lens-resolver";
const open = defineModel<boolean>({ required: true });
defineProps<{ loggedIn: boolean; loggingOut: boolean }>();
const emit = defineEmits<{ logout: []; edit: [lens: Lens] }>();
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
