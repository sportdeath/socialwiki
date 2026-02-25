import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { GraffitiGuardRequest } from "../backend/graffiti-server";

type ApprovalRuleScope = "similar" | "all";

export type GraffitiGuardApprovalRule = {
  id?: number;
  scope: ApprovalRuleScope;
  method: GraffitiGuardRequest["method"];
  transcludeId: string | null;
  argsFingerprint: string | null;
  createdAtMs: number;
};

interface GraffitiGuardApprovalDb extends DBSchema {
  rules: {
    key: number;
    value: GraffitiGuardApprovalRule;
  };
}

const DB_NAME = "socialwiki-graffiti-guard";
const DB_VERSION = 1;
const RULES_STORE = "rules";

let dbPromise: Promise<IDBPDatabase<GraffitiGuardApprovalDb>> | null = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<GraffitiGuardApprovalDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(RULES_STORE)) {
        db.createObjectStore(RULES_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
  return dbPromise;
}

function argsFingerprintReplacer(_key: string, value: unknown) {
  if (value instanceof ArrayBuffer) {
    return { __type: "ArrayBuffer", byteLength: value.byteLength };
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return {
      __type: "Blob",
      type: value.type || "application/octet-stream",
      size: value.size,
    };
  }
  return value;
}

function getArgsFingerprint(args: GraffitiGuardRequest["args"]): string | null {
  try {
    return JSON.stringify(args, argsFingerprintReplacer);
  } catch {
    return null;
  }
}

function baseRuleMatches(
  rule: GraffitiGuardApprovalRule,
  request: GraffitiGuardRequest,
) {
  console.log("Comparing rule to request", { rule, request });
  return (
    rule.method === request.method && rule.transcludeId === request.transcludeId
  );
}

function matchesSimilarRule(
  rule: GraffitiGuardApprovalRule,
  request: GraffitiGuardRequest,
) {
  // Scaffold for method-specific similarity matching. Intentionally conservative
  // for now so "similar" approvals are stored but not auto-applied yet.
  switch (request.method) {
    case "post":
    case "postMedia":
    case "delete":
    case "deleteMedia":
    case "get":
    case "getMedia":
    case "discover":
    case "logout":
    default:
      return false;
  }
}

export async function saveGraffitiGuardApprovalRule(
  request: GraffitiGuardRequest,
  scope: ApprovalRuleScope,
) {
  if (!canUseIndexedDb()) return;

  const db = await getDb();
  await db.add(RULES_STORE, {
    scope,
    method: request.method,
    transcludeId: request.transcludeId,
    argsFingerprint: getArgsFingerprint(request.args),
    createdAtMs: Date.now(),
  });
}

export async function hasMatchingGraffitiGuardApprovalRule(
  request: GraffitiGuardRequest,
) {
  if (!canUseIndexedDb()) return false;

  const db = await getDb();
  const rules = await db.getAll(RULES_STORE);

  for (const rule of rules) {
    if (!baseRuleMatches(rule, request)) continue;
    if (rule.scope === "all") return true;
    if (rule.scope === "similar" && matchesSimilarRule(rule, request)) {
      return true;
    }
  }

  return false;
}
