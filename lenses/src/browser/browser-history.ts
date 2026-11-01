import type {
    GraffitiObject,
    JSONSchema,
} from "@graffiti-garden/api";
import {
    useGraffiti,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import {
    computed,
    ref,
    shallowRef,
    toValue,
    watch,
    type MaybeRefOrGetter,
} from "vue";
import { confirmationSchema } from "../utils/schemas";

interface VisitedSite {
    address: string;
    visits: number;
    lastVisitedAt: number;
}

export function browserHistorySchema(visitedAfter: number) {
    return {
        properties: {
            allowed: {
                type: "array",
                maxItems: 0,
            },
            value: {
                properties: {
                    action: { const: "Visit site" },
                    "site address": { type: "string" },
                    time: {
                        type: "number",
                        minimum: visitedAfter,
                    },
                },
                required: ["action", "site address", "time"],
            },
        },
        required: ["allowed", "value"],
    } as const satisfies JSONSchema;
}

type BrowserHistoryEntry = GraffitiObject<
    ReturnType<typeof browserHistorySchema>
>;

export function browserHistorySettingSchema() {
    return {
        properties: {
            allowed: { type: "array", maxItems: 0 },
            value: {
                type: "object",
                allOf: [confirmationSchema],
                properties: {
                    action: { const: "Set browser history" },
                    enabled: { type: "boolean" },
                    time: { type: "number" },
                },
                required: ["action", "enabled", "time"],
            },
        },
        required: ["allowed", "value"],
    } as const satisfies JSONSchema;
}

type BrowserHistorySetting = GraffitiObject<ReturnType<typeof browserHistorySettingSchema>>;

function normalizeAddress(address: string) {
    return address.trim();
}

function aggregateVisits(entries: BrowserHistoryEntry[]) {
    const sitesByAddress = new Map<string, VisitedSite>();
    for (const entry of entries) {
        const address = normalizeAddress(entry.value["site address"]);
        if (!address) continue;

        const existing = sitesByAddress.get(address);
        sitesByAddress.set(address, {
            address,
            visits: (existing?.visits ?? 0) + 1,
            lastVisitedAt: Math.max(
                existing?.lastVisitedAt ?? 0,
                entry.value.time,
            ),
        });
    }

    return [...sitesByAddress.values()];
}

function listVisitedSites(
    entries: BrowserHistoryEntry[],
    query = "",
    limit = 8,
) {
    const normalizedQuery = query.trim().toLowerCase();
    const sites = aggregateVisits(entries).filter(
        (site) =>
            normalizedQuery.length === 0 ||
            site.address.toLowerCase().includes(normalizedQuery),
    );

    sites.sort((left, right) => {
        if (normalizedQuery.length > 0) {
            const leftStarts = left.address
                .toLowerCase()
                .startsWith(normalizedQuery);
            const rightStarts = right.address
                .toLowerCase()
                .startsWith(normalizedQuery);
            if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        }

        if (left.visits !== right.visits) return right.visits - left.visits;
        if (left.lastVisitedAt !== right.lastVisitedAt)
            return right.lastVisitedAt - left.lastVisitedAt;
        return left.address.localeCompare(right.address);
    });

    return sites.slice(0, limit);
}

export function useBrowserHistory(
    siteAddress: MaybeRefOrGetter<string | undefined>,
) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();

    const historyCutoff = new Date();
    historyCutoff.setDate(historyCutoff.getDate() - 30);
    const visitedAfter = historyCutoff.setHours(0, 0, 0, 0);
    // One query supplies both the explicit setting and recent visit suggestions.
    const { objects, isFirstPoll, error: discoveryError } = useGraffitiDiscover(
        () => (session.value ? [session.value.actor] : []),
        () => ({
            properties: { actor: { const: session.value?.actor ?? "" } },
            anyOf: [browserHistorySchema(visitedAfter), browserHistorySettingSchema()],
        } as JSONSchema),
        () => session.value,
    );
    // Discovery batches local updates. Apply a successful setting immediately
    // so disabling history cannot record another visit during that short delay.
    const pendingSetting = shallowRef<BrowserHistorySetting>();
    watch(objects, records => {
        if (records.some(record => record.url === pendingSetting.value?.url)) pendingSetting.value = undefined;
    });
    const settings = computed(() => [...objects.value.filter(
        (object): object is BrowserHistorySetting =>
            (object.value as { action?: unknown }).action === "Set browser history",
    ), ...(pendingSetting.value ? [pendingSetting.value] : [])]
        .sort((a, b) => b.value.time - a.value.time || Number(a.value.enabled) - Number(b.value.enabled)));
    const visits = computed(() => objects.value.filter(
        (object): object is BrowserHistoryEntry =>
            (object.value as { action?: unknown }).action === "Visit site",
    ));
    // Legacy visits remain suggestions, but their presence never enables recording.
    const enabled = computed(() =>
        !session.value || isFirstPoll.value
            ? undefined
            : settings.value[0]?.value.enabled ?? false,
    );
    const saving = ref(false);
    const saveError = ref("");
    const error = computed(() => saveError.value || discoveryError.value?.message || "");

    async function setEnabled(value: boolean) {
        const currentSession = session.value;
        if (!currentSession || enabled.value === undefined || saving.value || enabled.value === value) return;
        saving.value = true;
        saveError.value = "";
        const previous = [...settings.value];
        try {
            const saved = await graffiti.post<ReturnType<typeof browserHistorySettingSchema>>({
                allowed: [],
                channels: [currentSession.actor],
                value: {
                    action: "Set browser history",
                    "confirm with guard": true,
                    enabled: value,
                    time: Math.max(Date.now(), ...previous.map(setting => setting.value.time + 1)),
                },
            }, currentSession);
            if (session.value?.actor === currentSession.actor) {
                pendingSetting.value = objects.value.some(record => record.url === saved.url) ? undefined : saved;
            }
            // Keep the old choice if confirmation is canceled. Once saved,
            // remove known earlier choices rather than depending on full discovery.
            const deletions = await Promise.allSettled(previous.map(setting => graffiti.delete(setting, currentSession)));
            const failed = deletions.find(result => result.status === "rejected");
            if (failed?.status === "rejected") throw failed.reason;
        } catch (error) {
            if (session.value?.actor === currentSession.actor) {
                saveError.value = error instanceof Error ? error.message : String(error);
            }
        } finally {
            saving.value = false;
        }
    }

    let lastRecordedVisit = "";
    watch(() => session.value?.actor, () => {
        lastRecordedVisit = "";
        saveError.value = "";
        pendingSetting.value = undefined;
    });
    async function record() {
        const currentSession = session.value;
        const site = normalizeAddress(toValue(siteAddress) ?? "");
        if (!currentSession || !site || !enabled.value || saving.value) return;

        const visit = `${currentSession.actor}:${site}`;
        if (visit === lastRecordedVisit) return;
        lastRecordedVisit = visit;
        try {
            await graffiti.post<ReturnType<typeof browserHistorySchema>>(
                {
                    allowed: [],
                    channels: [currentSession.actor],
                    value: {
                        action: "Visit site",
                        "site address": site,
                        time: Date.now(),
                    },
                },
                currentSession,
            );
        } catch (error) {
            if (lastRecordedVisit === visit) lastRecordedVisit = "";
            console.error("Recording browser history failed", error);
        }
    }

    watch(
        [() => toValue(siteAddress), () => session.value?.actor, enabled, saving],
        () => void record(),
        { immediate: true },
    );

    return {
        enabled,
        saving,
        error,
        suggestions: (query = "") => listVisitedSites(visits.value, query),
        setEnabled,
    };
}

export type BrowserHistory = ReturnType<typeof useBrowserHistory>;
