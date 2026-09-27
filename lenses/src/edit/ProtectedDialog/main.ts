import { computed, defineComponent, type PropType } from "vue";
import type { ProtectionObject } from "../../utils/schemas";
import DialogFrame from "../../utils/DialogFrame/main";
import ProtectionNotice from "../../utils/ProtectionNotice/main";
type Props = {
    modelValue: boolean;
    activeProtection: ProtectionObject | null;
    isProtectionBySessionActor: boolean;
    activeProtectionTrustSource: "default" | "trusted" | null;
    historyRoute: string;
    viewRoute: string;
};
function setupProtectedDialog(props: Props, { emit }: { emit: (event: "update:modelValue", value: boolean) => void }) {
    const open = computed({
        get: () => props.modelValue,
        set: (value: boolean) => emit("update:modelValue", value),
    });
    const trustedEditorsRoute = "#/v?/trusted-editors";
    return { open, trustedEditorsRoute };
}

export default defineComponent({
    template: "#protected-dialog-template",
    components: { DialogFrame, ProtectionNotice },
    props: {
        modelValue: { type: Boolean, required: true },
        activeProtection: { type: Object as PropType<ProtectionObject | null>, default: null },
        isProtectionBySessionActor: { type: Boolean, required: true },
        activeProtectionTrustSource: { type: String as PropType<Props["activeProtectionTrustSource"]>, default: null },
        historyRoute: { type: String, required: true },
        viewRoute: { type: String, required: true },
    },
    emits: ["update:modelValue"],
    setup: setupProtectedDialog,
});
