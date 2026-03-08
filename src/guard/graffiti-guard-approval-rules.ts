import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { GraffitiGuardRequest } from "../backend/graffiti-server";
import {
  methodToCategory,
  type GraffitiPermissionCategory,
} from "./graffiti-guard-permission-categories";

type ApprovalRuleScope = "similar" | "all";

export type GraffitiGuardApprovalRule = {
  id?: number;
  scope: ApprovalRuleScope;
  permissionCategory: GraffitiPermissionCategory;
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
const DB_VERSION = 2;
const RULES_STORE = "rules";

let dbPromise: Promise<IDBPDatabase<GraffitiGuardApprovalDb>> | null = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<GraffitiGuardApprovalDb>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2 && db.objectStoreNames.contains(RULES_STORE)) {
        db.deleteObjectStore(RULES_STORE);
      }
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
  requestCategory: GraffitiPermissionCategory,
  request: GraffitiGuardRequest,
) {
  return (
    rule.permissionCategory === requestCategory &&
    rule.transcludeId === request.transcludeId
  );
}

function matchesSimilarRule(
  _rule: GraffitiGuardApprovalRule,
  _request: GraffitiGuardRequest,
  _requestCategory: GraffitiPermissionCategory,
) {
  // Scaffold for method-specific similarity matching. Intentionally conservative
  // for now so "similar" approvals are stored but not auto-applied yet.
  return false;
}

export async function saveGraffitiGuardApprovalRule(
  request: GraffitiGuardRequest,
  scope: ApprovalRuleScope,
) {
  if (!canUseIndexedDb()) return;

  const db = await getDb();
  await db.add(RULES_STORE, {
    scope,
    permissionCategory: methodToCategory(request.method),
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
  const requestCategory = methodToCategory(request.method);

  for (const rule of rules) {
    if (!baseRuleMatches(rule, requestCategory, request)) continue;
    if (rule.scope === "all") return true;
    if (
      rule.scope === "similar" &&
      matchesSimilarRule(rule, request, requestCategory)
    ) {
      return true;
    }
  }

  return false;
}

export async function listGraffitiGuardApprovalRules() {
  if (!canUseIndexedDb()) return [] as GraffitiGuardApprovalRule[];

  const db = await getDb();
  return db.getAll(RULES_STORE);
}

export async function clearGraffitiGuardApprovalRule(ruleId: number) {
  if (!canUseIndexedDb()) return;

  const db = await getDb();
  await db.delete(RULES_STORE, ruleId);
}

export async function clearAllGraffitiGuardApprovalRulesForTranscludeId(
  transcludeId: string | null,
) {
  if (!canUseIndexedDb()) return;

  const db = await getDb();
  const rules = await db.getAll(RULES_STORE);
  const deletions = rules
    .filter((rule) => rule.scope === "all" && rule.transcludeId === transcludeId)
    .map((rule) => (rule.id == null ? null : db.delete(RULES_STORE, rule.id)));
  await Promise.all(deletions.filter(Boolean));
}
