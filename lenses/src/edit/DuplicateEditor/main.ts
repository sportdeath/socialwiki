import { computed, defineComponent, ref } from "vue";

export default defineComponent({
    template: "#edit-duplicate-template",
    props: {
        siteName: { type: String, required: true },
        publishing: { type: Boolean, required: true },
    },
    emits: {
        publish: (_name: string) => true,
    },
    setup(props, { emit }) {
        const newName = ref("");
        const normalizedName = computed(() => newName.value.trim());
        const canPublish = computed(() => !!normalizedName.value);

        function publish() {
            if (canPublish.value && !props.publishing) emit("publish", normalizedName.value);
        }

        return { newName, canPublish, publish };
    },
});
