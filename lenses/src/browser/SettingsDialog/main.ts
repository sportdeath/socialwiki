import { computed, defineComponent, ref, type PropType } from "vue";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import DialogFrame from "../../utils/DialogFrame/main";
import type { Lens } from "../../utils/lenses";
import type { LensSources } from "../lens-resolver";

const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;
type Props = { modelValue: boolean; lensSources: LensSources };
function setupSettingsDialog(props: Props, { emit }: { emit: (event: "update:modelValue", value: boolean) => void }) {
    const open = computed({
        get: () => props.modelValue,
        set: (value: boolean) => emit("update:modelValue", value),
    });
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const lensDiscoveryError = props.lensSources.error;
    const loggingOut = ref(false);
    const resetting = ref<Lens | null>(null);
    const modifying = ref<Lens | null>(null);
    const busy = computed(
        () =>
            loggingOut.value || resetting.value !== null || modifying.value !== null,
    );

    async function logout() {
        const currentSession = session.value;
        if (!currentSession || busy.value) return;

        loggingOut.value = true;
        open.value = false;
        try {
            await graffiti.logout(currentSession);
        } catch (error) {
            reportSettingsError("Logging out", error);
        } finally {
            loggingOut.value = false;
        }
    }

    async function modifyLens(lens: Lens) {
        if (busy.value) return;
        modifying.value = lens;
        try {
            const draft = await props.lensSources.getSource(lens);
            const currentBrowserAddress = window.address ?? "";
            const { query } = parseAddress(currentBrowserAddress);
            const { address: siteAddress } = parseQuery(query);
            const editableSiteAddress = composeAddress(
                lens,
                composeQuery(
                    undefined,
                    lens === "browser" ? currentBrowserAddress : siteAddress,
                ),
            );
            open.value = false;
            window.navigate(
                composeQuery(
                    undefined,
                    composeAddress(
                        "e",
                        composeQuery(
                            new URLSearchParams({ draft }),
                            editableSiteAddress,
                        ),
                    ),
                )
            );
        } catch (error) {
            reportSettingsError("Opening lens editor", error);
        } finally {
            modifying.value = null;
        }
    }

    async function resetLens(lens: Lens) {
        const currentSession = session.value;
        if (!currentSession || busy.value) return;

        resetting.value = lens;
        try {
            await props.lensSources.reset(lens, currentSession);
        } catch (error) {
            reportSettingsError(`Resetting ${lens}`, error);
        } finally {
            resetting.value = null;
        }
    }

    function reportSettingsError(action: string, error: unknown) {
        console.error(action, error);
        alert(
            `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    return { open, session, lensDiscoveryError, loggingOut, resetting, modifying, busy, logout, modifyLens, resetLens };
}

export default defineComponent({
    template: "#settings-dialog-template",
    components: { DialogFrame },
    props: {
        lensSources: { type: Object as PropType<LensSources>, required: true },
        modelValue: { type: Boolean, required: true },
    },
    emits: ["update:modelValue"],
    setup: setupSettingsDialog,
});
