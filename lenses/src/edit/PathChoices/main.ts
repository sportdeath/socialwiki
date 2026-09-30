import { defineComponent, type PropType } from "vue";

export type EditPath = "ai" | "local" | "code";

export default defineComponent({
    template: "#edit-path-choices-template",
    props: {
        mode: { type: String as PropType<"create" | "edit">, required: true },
        siteName: { type: String, required: true },
    },
    emits: {
        select: (_path: EditPath) => true,
    },
});
