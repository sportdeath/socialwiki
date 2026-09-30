import { defineComponent, nextTick, onBeforeUnmount, ref, useTemplateRef, watch, type PropType } from "vue";
import { buildMetaPrompt, extractHtmlFromClipboard } from "../authoring";

const aiSites = [
    { name: "Gemini", href: "https://gemini.google.com/", icon: "gemini.google.com" },
    { name: "ChatGPT", href: "https://chatgpt.com/", icon: "chatgpt.com" },
    { name: "Claude", href: "https://claude.ai/", icon: "claude.ai" },
    { name: "Perplexity", href: "https://www.perplexity.ai/", icon: "perplexity.ai" },
    { name: "Mistral Vibe", href: "https://chat.mistral.ai/", icon: "mistral.ai" },
    { name: "DeepSeek", href: "https://chat.deepseek.com/", icon: "deepseek.com" },
    { name: "Microsoft Copilot", href: "https://copilot.microsoft.com/", icon: "copilot.microsoft.com" },
    { name: "Grok", href: "https://grok.com/", icon: "grok.com" },
    { name: "Qwen", href: "https://chat.qwen.ai/", icon: "qwen.ai" },
    { name: "Kimi", href: "https://www.kimi.com/en/", icon: "kimi.com" },
].map((site) => ({
    ...site,
    icon: `https://www.google.com/s2/favicons?sz=64&domain=${site.icon}`,
}));

export default defineComponent({
    template: "#edit-ai-template",
    props: {
        mode: { type: String as PropType<"create" | "edit">, required: true },
        siteName: { type: String, required: true },
        html: { type: String, required: true },
        guideText: { type: String as PropType<string | null>, default: null },
        guideError: { type: String, default: "" },
        hasWorkingDocument: { type: Boolean, required: true },
        resultPasted: { type: Boolean, required: true },
        publishing: { type: Boolean, required: true },
    },
    emits: ["paste", "publish", "retry-guide"],
    setup(props, { emit }) {
        const chatbotStep = useTemplateRef<HTMLElement>("chatbotStep");
        const publishStep = useTemplateRef<HTMLElement>("publishStep");
        const request = ref("");
        const copied = ref(false);
        const copyFeedback = ref("");
        const pasteFeedback = ref("");
        let feedbackTimer: number | undefined;
        function showCopyFeedback(message: string) {
            copyFeedback.value = message;
            clearTimeout(feedbackTimer);
            feedbackTimer = window.setTimeout(() => { copyFeedback.value = ""; }, 3000);
        }
        watch(request, () => { copied.value = false; });
        onBeforeUnmount(() => clearTimeout(feedbackTimer));
        async function scrollToStep(element: typeof chatbotStep) {
            await nextTick();
            element.value?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start",
            });
        }

        async function copyInstructions() {
            if (!props.guideText || !request.value.trim()) return;
            try {
                await navigator.clipboard.writeText(buildMetaPrompt(
                    props.mode, props.siteName, request.value.trim(), props.guideText,
                    props.hasWorkingDocument ? props.html : undefined,
                ));
                copied.value = true;
                showCopyFeedback("Copied");
                await scrollToStep(chatbotStep);
            } catch (error) {
                showCopyFeedback(`Could not copy: ${String(error)}`);
            }
        }

        async function pasteResult() {
            pasteFeedback.value = "";
            try {
                emit("paste", extractHtmlFromClipboard(await navigator.clipboard.readText()));
                pasteFeedback.value = "Pasted";
                await scrollToStep(publishStep);
            } catch (error) {
                pasteFeedback.value = error instanceof Error ? error.message : String(error);
            }
        }

        return { aiSites, request, copied, copyFeedback, pasteFeedback, copyInstructions, pasteResult };
    },
});
