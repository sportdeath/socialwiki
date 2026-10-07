import { ref, computed, defineComponent, nextTick, onMounted, watch, useTemplateRef } from "vue";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import {
    normalizeSiteVersions,
    siteVersionsSchema,
    sortSiteVersions,
    type SiteVersionObject,
} from "../../utils/site-versions";
import DialogFrame from "../../utils/DialogFrame/main";
import { siteChannels } from "../../utils/site-channel";
type Props = { modelValue: boolean; siteName: string; sourceSiteName: string; publishing: boolean };
type Emit = {
    (event: "publish", siteName: string, summary: string,
        versions: SiteVersionObject[]): void;
    (event: "update:modelValue", value: boolean): void;
};
function setupPublishDialog(props: Props, { emit }: { emit: Emit }) {
    const open = computed({
        get: () => props.modelValue,
        set: (value: boolean) => emit("update:modelValue", value),
    });
    const publishSummaryInput = useTemplateRef<HTMLInputElement>(
        "publishSummaryInput",
    );
    const publishDialogSiteName = ref(props.siteName);
    const publishDialogSummary = ref(
        props.sourceSiteName ? `Duplicated from ${props.sourceSiteName}` : "",
    );
    const publishAudienceConfirmed = ref(false);
    const publishRequested = ref(false);
    const normalizedPublishSiteName = computed(() =>
        publishDialogSiteName.value.trim(),
    );
    const normalizedPublishSummary = computed(() =>
        publishDialogSummary.value.trim(),
    );
    const { objects: publishedVersions, error: discoveryError, isFirstPoll } =
        useGraffitiDiscover(
            () => normalizedPublishSiteName.value
                ? siteChannels(normalizedPublishSiteName.value) : [],
            () => siteVersionsSchema(normalizedPublishSiteName.value),
        );
    const previewSiteName = ref(normalizedPublishSiteName.value);
    const previewStatus = ref<"loading" | "ok" | "not-found" | "error">("loading");
    watch(normalizedPublishSiteName, (name, _previousName, onCleanup) => {
        previewSiteName.value = "";
        previewStatus.value = "loading";
        if (!name) return;
        const timeout = window.setTimeout(() => { previewSiteName.value = name; }, 250);
        onCleanup(() => window.clearTimeout(timeout));
    });
    const previewShowsSite = computed(() =>
        previewSiteName.value === normalizedPublishSiteName.value && previewStatus.value === "ok",
    );
    watch(previewShowsSite, () => { publishAudienceConfirmed.value = false; });
    const publishSiteHref = computed(
        () => `#/v?/${normalizedPublishSiteName.value}`,
    );
    watch(publishDialogSiteName, (nextSiteName, previousSiteName) => {
        if (nextSiteName !== previousSiteName) {
            publishAudienceConfirmed.value = false;
        }
    });
    watch([publishDialogSiteName, publishDialogSummary, publishAudienceConfirmed], () => {
        publishRequested.value = false;
    }, { flush: "sync" });
    watch(isFirstPoll, (loading) => {
        if (!loading && publishRequested.value && open.value) {
            publishRequested.value = false;
            publish();
        }
    });

    onMounted(async () => {
        await nextTick();
        publishSummaryInput.value?.focus();
    });
    function cancelPublishDialog() {
        if (!props.publishing) open.value = false;
    }
    function selectAllPublishSiteName(event: FocusEvent | MouseEvent) {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;
        target.select();
        target.setSelectionRange(0, target.value.length);
    }

    function onPreviewOutput(event: CustomEvent<unknown>) {
        event.preventDefault();
        if ((event.currentTarget as HTMLElement).getAttribute("src") !== previewSiteName.value) return;
        if (typeof event.detail !== "object" || event.detail === null) return;
        const status = (event.detail as { status?: unknown }).status;
        if (status === "loading" || status === "ok" || status === "not-found" || status === "error") {
            previewStatus.value = status;
        }
    }

    function publish() {
        if (props.publishing) return;
        const name = normalizedPublishSiteName.value;
        // Use the versions found by the initial discovery, including partial results.
        const versions = sortSiteVersions(
            normalizeSiteVersions(publishedVersions.value, name),
        );
        emit("publish", name, normalizedPublishSummary.value, versions);
    }
    function submitPublishDialog() {
        if (props.publishing) return;
        if (isFirstPoll.value) {
            publishRequested.value = true;
            return;
        }
        publish();
    }
    return {
        open,
        publishDialogSiteName,
        publishDialogSummary,
        publishAudienceConfirmed,
        publishRequested,
        normalizedPublishSiteName,
        publishSiteHref,
        previewShowsSite,
        previewSiteName,
        previewStatus,
        isFirstPoll,
        discoveryError,
        cancelPublishDialog,
        selectAllPublishSiteName,
        onPreviewOutput,
        submitPublishDialog,
    };
}

export default defineComponent({
    template: "#publish-dialog-template",
    components: { DialogFrame },
    props: {
        modelValue: { type: Boolean, required: true },
        siteName: { type: String, required: true },
        sourceSiteName: { type: String, default: "" },
        publishing: { type: Boolean, required: true },
    },
    emits: ["publish", "update:modelValue"],
    setup: setupPublishDialog,
});
