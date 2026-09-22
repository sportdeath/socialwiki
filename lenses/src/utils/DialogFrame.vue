<template>
    <dialog
        ref="dialog"
        class="lens-dialog"
        :aria-label="label"
        @cancel.prevent="emit('cancel')"
        @click.self="emit('cancel')"
    >
        <section class="dialog-panel"><slot /></section>
    </dialog>
</template>
<script setup lang="ts">
import { useTemplateRef, watchEffect } from "vue";
const open = defineModel<boolean>({ required: true });
defineProps<{ label: string }>();
const emit = defineEmits<{ cancel: [] }>();
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
// Native modal dialogs provide focus containment/restoration and Escape handling.
watchEffect(
    () => {
        if (open.value && !dialog.value?.open) dialog.value?.showModal();
        else if (!open.value && dialog.value?.open) dialog.value.close();
    },
    { flush: "post" },
);
</script>
<style>
.lens-dialog {
    position: fixed;
    inset: 0;
    justify-items: center;
    align-items: start;
    overflow: auto;
    padding: 1rem;
    background: var(--backdrop-subtle-color);
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    border: none;
    color: var(--text-color);
}
.lens-dialog[open] {
    display: grid;
}
.lens-dialog::backdrop {
    background: transparent;
}
.lens-dialog .dialog-panel {
    width: min(42rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color);
    color: var(--text-color);
    box-shadow: 0 0 2.5rem rgb(0 0 0 / 0.9);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 1.5rem;
}
.lens-dialog h2,
.lens-dialog p {
    margin: 0;
}
.lens-dialog h2 {
    font-size: 2rem;
}
.lens-dialog footer {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
}
.lens-dialog .allow-button {
    border: 1px solid var(--border-color);
    background: var(--accent-button-background);
    color: var(--accent-button-text);
    border-radius: 0.5rem;
    padding: 0.35rem 0.75rem;
    font-weight: 600;
}
.lens-dialog .allow-button:hover {
    border-color: var(--border-color-hover);
    background: var(--accent-button-background-hover);
    color: var(--accent-button-text);
    text-decoration: none;
}
.lens-dialog .allow-button:disabled {
    border-color: var(--border-color);
    background: var(--background-color-interactive);
    color: var(--text-color);
    cursor: not-allowed;
}
</style>
