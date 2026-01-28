<template>
    <div class="iframe-wrapper">
        <iframe
            ref="iframe"
            :key="key"
            :srcdoc="
                html === undefined
                    ? 'Loading...'
                    : (html ?? 'No page here yet - create one!')
            "
            title="SocialWiki Page"
            loading="lazy"
            frameborder="0"
            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
        ></iframe>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { serveGraffiti } from "../rpc/server";

defineProps<{
    html: string | null | undefined;
}>();

const key = ref(0);
function refresh() {
    key.value++;
}

defineExpose({
    refresh,
});

let destroy: () => void = () => {};
const iframe = useTemplateRef("iframe");
watch(iframe, async (newIframe) => {
    destroy();
    if (!newIframe) return;
    destroy = await serveGraffiti(newIframe);
});
onBeforeUnmount(() => {
    destroy();
});
</script>

<style scoped>
.iframe-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
}

iframe {
    width: 100%;
}
</style>
