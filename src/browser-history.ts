import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "socialwiki-browser-history";
const DB_VERSION = 1;
const STORE_NAME = "visited-pages";

export interface VisitedPage {
    address: string;
    visits: number;
    lastVisitedAt: number;
}

interface BrowserHistoryDB extends DBSchema {
    [STORE_NAME]: {
        key: string;
        value: VisitedPage;
    };
}

let databasePromise: Promise<IDBPDatabase<BrowserHistoryDB>> | undefined;

function getDatabase() {
    if (!databasePromise) {
        databasePromise = openDB<BrowserHistoryDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (db.objectStoreNames.contains(STORE_NAME)) return;
                db.createObjectStore(STORE_NAME, { keyPath: "address" });
            },
        });
    }
    return databasePromise;
}

function normalizeAddress(address: string) {
    return address.trim();
}

export async function recordPageVisit(address: string) {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) return;

    const db = await getDatabase();
    const existing = await db.get(STORE_NAME, normalizedAddress);
    const next: VisitedPage = {
        address: normalizedAddress,
        visits: (existing?.visits ?? 0) + 1,
        lastVisitedAt: Date.now(),
    };
    await db.put(STORE_NAME, next);
}

function rankSuggestions(
    pages: VisitedPage[],
    query: string,
    limit: number,
): VisitedPage[] {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered =
        normalizedQuery.length === 0
            ? pages
            : pages.filter((page) =>
                  page.address.toLowerCase().includes(normalizedQuery),
              );

    filtered.sort((left, right) => {
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

    return filtered.slice(0, limit);
}

export async function listVisitedPages(query = "", limit = 8) {
    const db = await getDatabase();
    const pages = await db.getAll(STORE_NAME);
    return rankSuggestions(pages, query, limit);
}
