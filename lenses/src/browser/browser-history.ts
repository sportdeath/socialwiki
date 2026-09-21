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
    toValue,
    watch,
    type MaybeRefOrGetter,
} from "vue";

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
    query: MaybeRefOrGetter<string | undefined>,
) {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();

    const historyCutoff = new Date();
    historyCutoff.setDate(historyCutoff.getDate() - 30);
    const visitedAfter = historyCutoff.setHours(0, 0, 0, 0);
    const { objects, isFirstPoll } = useGraffitiDiscover(
        () => (session.value ? [session.value.actor] : []),
        () => browserHistorySchema(visitedAfter),
        () => session.value,
    );
    const enabled = computed(() =>
        !session.value || isFirstPoll.value
            ? undefined
            : objects.value.length > 0,
    );
    const suggestions = computed(() =>
        listVisitedSites(objects.value, toValue(query) ?? ""),
    );

    let lastRecordedVisit = "";
    async function record(force = false) {
        const currentSession = session.value;
        const site = normalizeAddress(toValue(siteAddress) ?? "");
        if (!currentSession || !site || (!force && !enabled.value)) return;

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
        [() => toValue(siteAddress), enabled],
        () => void record(),
        { immediate: true },
    );

    return {
        enabled,
        suggestions,
        enable: () => void record(true),
    };
}
