import { ref, computed, defineComponent, nextTick, onMounted, watch, useTemplateRef } from "vue";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import {
    normalizeSiteVersions,
    siteVersionsSchema,
    sortSiteVersions,
    type SiteVersionObject,
} from "../../utils/site-versions";
import DialogFrame from "../../utils/DialogFrame/main";
type Props = { modelValue: boolean; siteName: string; publishing: boolean };
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
    const publishDialogSummary = ref("");
    const publishAudienceConfirmed = ref(false);
    const normalizedPublishSiteName = computed(() =>
        publishDialogSiteName.value.trim(),
    );
    const normalizedPublishSummary = computed(() =>
        publishDialogSummary.value.trim(),
    );
    const { objects: publishedVersions, error: discoveryError, isFirstPoll } =
        useGraffitiDiscover(
            () => normalizedPublishSiteName.value
                ? [normalizedPublishSiteName.value] : [],
            () => siteVersionsSchema(normalizedPublishSiteName.value),
        );
    const publishSiteHref = computed(
        () => `#/v?/${normalizedPublishSiteName.value}`,
    );
    const isPublishDialogValid = computed(
        () =>
            normalizedPublishSiteName.value.length > 0 &&
            normalizedPublishSummary.value.length > 0 &&
            publishAudienceConfirmed.value,
    );
    watch(publishDialogSiteName, (nextSiteName, previousSiteName) => {
        if (nextSiteName !== previousSiteName && publishAudienceConfirmed.value) {
            publishAudienceConfirmed.value = false;
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

    function submitPublishDialog() {
        if (
            props.publishing || isFirstPoll.value ||
            !isPublishDialogValid.value
        ) return;

        const name = normalizedPublishSiteName.value;
        // Use the versions found by the initial discovery, including partial results.
        const versions = sortSiteVersions(
            normalizeSiteVersions(publishedVersions.value, name),
        );
        emit("publish", name, normalizedPublishSummary.value, versions);
    }
    return {
        open,
        publishDialogSiteName,
        publishDialogSummary,
        publishAudienceConfirmed,
        normalizedPublishSiteName,
        publishSiteHref,
        isPublishDialogValid,
        isFirstPoll,
        discoveryError,
        cancelPublishDialog,
        selectAllPublishSiteName,
        submitPublishDialog,
    };
}

export default defineComponent({
    template: "#publish-dialog-template",
    components: { DialogFrame },
    props: {
        modelValue: { type: Boolean, required: true },
        siteName: { type: String, required: true },
        publishing: { type: Boolean, required: true },
    },
    emits: ["publish", "update:modelValue"],
    setup: setupPublishDialog,
});
