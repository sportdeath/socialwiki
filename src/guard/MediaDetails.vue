<template>
    <details class="guard-details">
        <summary>{{ summary }}</summary>
        <template v-if="media">
            <dl>
                <dt>Action</dt>
                <dd :class="{ warning }">
                    {{ action }}
                </dd>
                <dt>Type</dt>
                <dd>{{ media.data.type }}</dd>
                <dt>Size</dt>
                <dd>{{ formatBytes(media.data.size) }}</dd>
                <dt>Contents</dt>
                <dd>
                    <img
                        v-if="
                            mediaPreviewUrl &&
                            media.data.type.startsWith('image/')
                        "
                        :src="mediaPreviewUrl"
                        :alt="
                            media.actor
                                ? `An image by ${media.actor}`
                                : 'Image preview'
                        "
                    />
                    <video
                        v-else-if="
                            mediaPreviewUrl &&
                            media.data.type.startsWith('video/')
                        "
                        controls
                        :src="mediaPreviewUrl"
                        :aria-label="
                            media.actor
                                ? `A video by ${media.actor}`
                                : 'Video preview'
                        "
                    />
                    <audio
                        v-else-if="
                            mediaPreviewUrl &&
                            media.data.type.startsWith('audio/')
                        "
                        controls
                        :src="mediaPreviewUrl"
                        :aria-label="
                            media.actor ? `Audio by ${media.actor}` : 'Audio'
                        "
                    />
                    <object
                        v-else-if="
                            mediaPreviewUrl &&
                            media.data.type.startsWith('application/pdf')
                        "
                        :data="mediaPreviewUrl"
                        type="application/pdf"
                        :aria-label="
                            media.actor
                                ? `PDF by ${media.actor}`
                                : 'PDF preview'
                        "
                    />
                    <button v-else type="button" @click="downloadMedia(media)">
                        Download
                    </button>
                </dd>
                <dt>Allowed (who can see the file)</dt>
                <dd>
                    <p v-if="!Array.isArray(media.allowed)">
                        <em>Anyone is allowed to see the file</em>
                    </p>
                    <p v-else-if="media.allowed.length === 0">
                        <em>Only you are allowed to see the file</em>
                    </p>
                    <template v-else>
                        <p>
                            You and the following people are allowed to see the
                            file
                        </p>
                        <ul>
                            <li v-for="allowed in media.allowed" :key="allowed">
                                <dl>
                                    <dt>Handle</dt>
                                    <dd>
                                        <code>
                                            <GraffitiActorToHandle
                                                :actor="allowed"
                                            />
                                        </code>
                                    </dd>
                                    <dt>Actor</dt>
                                    <dd>
                                        <code>{{ allowed }}</code>
                                    </dd>
                                </dl>
                            </li>
                        </ul>
                    </template>
                </dd>
                <template v-if="media.actor">
                    <dt>Creator</dt>
                    <dd>
                        <dl>
                            <dt>Handle</dt>
                            <dd>
                                <code>
                                    <GraffitiActorToHandle
                                        :actor="media.actor"
                                    />
                                </code>
                            </dd>
                            <dt>Actor</dt>
                            <dd>
                                <code>{{ media.actor }}</code>
                            </dd>
                        </dl>
                    </dd>
                </template>
            </dl>
        </template>
    </details>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { GraffitiMedia, GraffitiPostMedia } from "@graffiti-garden/api";
import "./details.css";

const props = defineProps<{
    media: (GraffitiPostMedia & Partial<GraffitiMedia>) | undefined | null;
    summary: string;
    action: string;
    warning?: boolean;
}>();

const mediaPreviewUrl = ref<string | null>(null);
watch(
    () => props.media?.data,
    (data, _prev, onCleanup) => {
        mediaPreviewUrl.value = null;
        if (typeof window === "undefined") return;
        if (!(data instanceof Blob)) return;

        const url = URL.createObjectURL(data);
        mediaPreviewUrl.value = url;

        onCleanup(() => {
            URL.revokeObjectURL(url);
        });
    },
    { immediate: true },
);

function formatBytes(size: number) {
    if (!Number.isFinite(size) || size < 0) return String(size);
    if (size < 1024) return `${size} ${size === 1 ? "byte" : "bytes"}`;

    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;

    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;

    const gb = mb / 1024;
    return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

function downloadMedia(
    media: (GraffitiPostMedia & Partial<GraffitiMedia>) | null | undefined,
) {
    if (!media) return;
    if (typeof window === "undefined") return;
    if (!(media.data instanceof Blob)) return;

    const href = URL.createObjectURL(media.data);
    const a = document.createElement("a");
    a.href = href;
    a.download = "file";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Revoke after the click has had a chance to start.
    setTimeout(() => URL.revokeObjectURL(href), 0);
}
</script>

<style scoped>
.guard-details {
    img,
    video,
    object {
        display: block;
        max-width: min(100%, 32rem);
        max-height: min(50dvh, 22rem);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--background-color-interactive);
    }

    audio {
        display: block;
        width: min(100%, 24rem);
    }

    object {
        width: min(100%, 32rem);
        height: min(50dvh, 22rem);
    }
}
</style>
