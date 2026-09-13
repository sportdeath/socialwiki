<template>
    <DialogFrame
        v-model="open"
        label="Publish changes"
        @cancel="cancelPublishDialog"
    >
        <h2 id="publish-title">Publish changes</h2>
        <form
            ref="form"
            class="publish-form"
            @keydown.enter="onEnter"
            @submit.prevent="submitPublishDialog"
        >
            <label class="publish-field">
                <span>Page name</span>
                <input
                    v-model="publishDialogPageName"
                    type="text"
                    required
                    autocomplete="off"
                    @focus="selectAllPublishPageName"
                    @click="selectAllPublishPageName"
                    :disabled="publishing"
                />
            </label>

            <label class="publish-field">
                Edit summary (Briefly describe your changes)
                <input
                    ref="publishSummaryInput"
                    v-model="publishDialogSummary"
                    type="text"
                    required
                    autocomplete="off"
                    :disabled="publishing"
                />
            </label>

            <div class="publish-audience-checkbox">
                <input
                    id="publish-audience-confirm"
                    v-model="publishAudienceConfirmed"
                    type="checkbox"
                    required
                    :disabled="publishing"
                />
                <label
                    for="publish-audience-confirm"
                    class="publish-audience-label"
                >
                    I understand this change will be seen by anyone who visits
                    the page "<a
                        class="publish-page-name-link"
                        :href="publishPageHref"
                        >{{ normalizedPublishPageName || "this page" }}</a
                    >".
                </label>
            </div>

            <p class="publish-license">
                By publishing changes, you irrevocably agree to release your
                contribution under the
                <a
                    href="https://www.gnu.org/licenses/gpl-3.0.en.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    >GNU GPLv3 License</a
                >.
            </p>

            <footer>
                <button
                    type="button"
                    class="secondary"
                    :disabled="publishing"
                    @click="cancelPublishDialog"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    @click="submitPublishDialog"
                    class="allow-button"
                    :disabled="publishing || !isPublishDialogValid"
                >
                    Publish
                </button>
            </footer>
        </form>
    </DialogFrame>
</template>
<script setup lang="ts">
import { ref, computed, watch, nextTick, useTemplateRef } from "vue";
import DialogFrame from "../utils/DialogFrame.vue";
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ pageName: string; publishing: boolean }>();
const emit = defineEmits<{ publish: [pageName: string, summary: string] }>();
const form = useTemplateRef<HTMLFormElement>("form");
const publishSummaryInput = useTemplateRef<HTMLInputElement>(
    "publishSummaryInput",
);
const publishDialogPageName = ref("");
const publishDialogSummary = ref("");
const publishAudienceConfirmed = ref(false);
const normalizedPublishPageName = computed(() =>
    publishDialogPageName.value.trim(),
);
const normalizedPublishSummary = computed(() =>
    publishDialogSummary.value.trim(),
);
const publishPageHref = computed(
    () => `#/v?/${encodeURIComponent(normalizedPublishPageName.value)}`,
);
const isPublishDialogValid = computed(
    () =>
        normalizedPublishPageName.value.length > 0 &&
        normalizedPublishSummary.value.length > 0 &&
        publishAudienceConfirmed.value,
);
watch(publishDialogPageName, (nextPageName, previousPageName) => {
    if (nextPageName !== previousPageName && publishAudienceConfirmed.value) {
        publishAudienceConfirmed.value = false;
    }
});

watch(open, async (visible) => {
    if (!visible) return;
    publishDialogPageName.value = props.pageName;
    publishDialogSummary.value = "";
    publishAudienceConfirmed.value = false;
    await nextTick();
    publishSummaryInput.value?.focus();
});
function cancelPublishDialog() {
    if (!props.publishing) open.value = false;
}
function selectAllPublishPageName(event: FocusEvent | MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    target.select();
    target.setSelectionRange(0, target.value.length);
}

// Sandboxed documents cannot submit forms. Validate explicitly and emit an
// application action for both the button and Enter in a text input.
function submitPublishDialog() {
    if (
        props.publishing ||
        !form.value?.reportValidity() ||
        !isPublishDialogValid.value
    )
        return;
    emit(
        "publish",
        normalizedPublishPageName.value,
        normalizedPublishSummary.value,
    );
}
function onEnter(event: KeyboardEvent) {
    if (
        !(event.target instanceof HTMLInputElement) ||
        event.target.type !== "text"
    )
        return;
    event.preventDefault();
    submitPublishDialog();
}
</script>
<style scoped>
.publish-form {
    display: flex;
    flex-direction: column;
    gap: 1.35rem;
}

.publish-field {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    font-size: 1.15rem;
}

.publish-field :is(input, textarea) {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color);
    color: var(--text-color);
    padding: 0.5rem 0.65rem;
    font: inherit;
}

.publish-field :is(input, textarea):focus-visible {
    outline: 2px solid var(--border-color-hover);
    outline-offset: 1px;
}

.publish-audience-checkbox {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    line-height: 1.4;
    font-size: 1.3rem;
    cursor: pointer;
}

.publish-audience-label {
    display: block;
    flex: 1;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color-interactive);
    cursor: pointer;
}

.publish-audience-checkbox input {
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    margin-top: 0;
    cursor: pointer;
}

.publish-page-name-link {
    color: var(--link-color);
    font-weight: 700;
    text-decoration: underline 2px;
    text-underline-offset: 0.12em;
}

.publish-license {
    font-size: 1rem;
    color: var(--secondary-color);
}
</style>
