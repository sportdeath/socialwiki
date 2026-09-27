import { computed, defineComponent, useTemplateRef, watchEffect } from "vue";

type Props = { label: string; modelValue: boolean };
type Emit = {
    (event: "cancel"): void;
    (event: "update:modelValue", value: boolean): void;
};

function setupDialogFrame(props: Props, { emit }: { emit: Emit }) {
    const open = computed({
        get: () => props.modelValue,
        set: (value: boolean) => emit("update:modelValue", value),
    });
    const dialog = useTemplateRef<HTMLDialogElement>("dialog");
    // Native modal dialogs provide focus containment/restoration and Escape handling.
    watchEffect(
        () => {
            if (open.value && !dialog.value?.open) dialog.value?.showModal();
            else if (!open.value && dialog.value?.open) dialog.value.close();
        },
        { flush: "post" },
    );
    return { emit };
}

export default defineComponent({
    template: "#dialog-frame-template",
    props: {
        label: { type: String, required: true },
        modelValue: { type: Boolean, required: true },
    },
    emits: ["cancel", "update:modelValue"],
    setup: setupDialogFrame,
});
