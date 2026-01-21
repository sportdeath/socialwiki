<template>
    <div class="iframe-wrapper">
        <iframe
            :key="key"
            :srcdoc="
                html === undefined
                    ? 'Loading...'
                    : (html ?? 'No page here yet - create one!')
            "
            title="SocialWiki Page"
            loading="lazy"
            frameborder="0"
        ></iframe>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

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
