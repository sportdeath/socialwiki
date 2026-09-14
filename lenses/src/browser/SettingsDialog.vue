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
                v-if="session"
                type="button"
                class="warning"
                :disabled="busy"
                @click="logout"
            >
                {{ loggingOut ? "Logging out..." : "Log Out" }}
            </button>
        </div>

        <section class="lens-settings">
            <h3>Modify Social.Wiki</h3>
            <p class="lens-warning">
                Advanced: changing these will change how you interact with all Social.Wiki sites.
            </p>

            <div class="lens-row">
                <strong>View</strong>
                <button type="button" :disabled="busy" @click="modifyLens('v')">
                    {{ modifying === "v" ? "Opening..." : "Modify" }}
                </button>
                <button
                    v-if="session"
                    type="button"
                    class="warning"
                    :disabled="busy"
                    @click="resetLens('v')"
                >
                    {{ resetting === "v" ? "Resetting..." : "Reset" }}
                </button>
            </div>
            <div class="lens-row">
                <strong>Edit</strong>
                <button type="button" :disabled="busy" @click="modifyLens('e')">
                    {{ modifying === "e" ? "Opening..." : "Modify" }}
                </button>
                <button
                    v-if="session"
                    type="button"
                    class="warning"
                    :disabled="busy"
                    @click="resetLens('e')"
                >
                    {{ resetting === "e" ? "Resetting..." : "Reset" }}
                </button>
            </div>
            <div class="lens-row">
                <strong>History</strong>
                <button type="button" :disabled="busy" @click="modifyLens('h')">
                    {{ modifying === "h" ? "Opening..." : "Modify" }}
                </button>
                <button
                    v-if="session"
                    type="button"
                    class="warning"
                    :disabled="busy"
                    @click="resetLens('h')"
                >
                    {{ resetting === "h" ? "Resetting..." : "Reset" }}
                </button>
            </div>
            <div class="lens-row">
                <strong>Browser</strong>
                <button
                    type="button"
                    :disabled="busy"
                    @click="modifyLens('browser')"
                >
                    {{ modifying === "browser" ? "Opening..." : "Modify" }}
                </button>
                <button
                    v-if="session"
                    type="button"
                    class="warning"
                    :disabled="busy"
                    @click="resetLens('browser')"
                >
                    {{
                        resetting === "browser" ? "Resetting..." : "Reset"
                    }}
                </button>
            </div>
        </section>
        <footer>
            <button type="button" class="secondary" @click="open = false">
                Close
            </button>
        </footer>
    </DialogFrame>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import DialogFrame from "../utils/DialogFrame.vue";
import type { Lens } from "../utils/lenses";
import type { LensSources } from "./lens-resolver";
import { decodeAddress, encodeRouteForRouter } from "./browser-route";

const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
    lensSources: LensSources;
}>();
const graffiti = useGraffiti();
const session = useGraffitiSession();
const router = useRouter();
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
        const currentBrowserAddress = decodeAddress(
            router.currentRoute.value.fullPath.replace(/^\//, ""),
        );
        const { query } = parseAddress(currentBrowserAddress);
        const { address: pageAddress } = parseQuery(query);
        const editablePageAddress = composeAddress(
            lens,
            composeQuery(
                undefined,
                lens === "browser" ? currentBrowserAddress : pageAddress,
            ),
        );
        open.value = false;
        await router.push(
            encodeRouteForRouter(
                composeAddress(
                    "e",
                    composeQuery(
                        new URLSearchParams({ draft }),
                        editablePageAddress,
                    ),
                ),
            ),
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

.settings-actions > button,
.lens-row button {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color-interactive);
    color: var(--text-color);
    padding: 0.45rem 0.65rem;
    text-decoration: none;
}

.settings-actions > button {
    text-align: left;
}

.settings-actions > button:hover,
.lens-row button:hover {
    background: var(--background-color-interactive-hover);
    border-color: var(--border-color-hover);
    color: var(--text-color);
    text-decoration: none;
}

.lens-settings {
    margin-top: 1.5rem;
}

.lens-settings h3 {
    margin-bottom: 0.25rem;
}

.lens-warning {
    margin-top: 0;
    color: var(--warning-color);
    font-size: 0.9rem;
}

.lens-row {
    display: grid;
    grid-template-columns: minmax(5rem, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.3rem;
}

.settings-actions > button.warning,
.lens-row button.warning {
    color: var(--warning-color);
    border-color: var(--warning-color);
}

.settings-actions > button.warning:hover,
.lens-row button.warning:hover {
    color: var(--warning-hover-color);
    border-color: var(--warning-hover-color);
}
</style>
