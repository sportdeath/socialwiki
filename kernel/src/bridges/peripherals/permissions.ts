import { validateSource, type SourceSegment } from "../source";
import type { PermissionRequirement, PeripheralRequest } from "./shared";
import { createPermissionUI } from "./ui";

export const PERMISSION_STORAGE_KEY = "socialwiki.peripherals.permissions.v1";
export type PermissionScope = Pick<PeripheralRequest, "source" | "capability">;
type Decision = PermissionScope & { label: string; allow: boolean };
export type PermissionEntry = Decision & { remembered: boolean; active: boolean };
export type PermissionAnswer = { allow: boolean; remember: boolean };
export type AskPermission = (source: SourceSegment[], permissions: PermissionRequirement[],
  signal: AbortSignal) => Promise<PermissionAnswer>;
export type PeripheralPermissions = {
  authorize(source: SourceSegment[], permissions: PermissionRequirement[], signal: AbortSignal,
    onRevoke?: () => void): Promise<boolean>;
  revoke(scope: PermissionScope): void;
  show(source: SourceSegment[]): void;
  registerDocument(source: SourceSegment[]): () => void;
};

// The host origin namespaces storage; IDs carry authority, names are labels.
export function permissionKey(scope: PermissionScope) {
  return JSON.stringify([scope.capability, ...scope.source.map(({ id }) => id)]);
}

export function createPeripheralPermissions(options: { storage?: Storage | null; ask?: AskPermission } = {}): PeripheralPermissions {
  let storage: Storage | undefined;
  try { storage = options.storage === undefined ? window.localStorage : options.storage ?? undefined; } catch { /* Session only. */ }
  let decisions = new Map<string, Decision>();
  const active = new Map<() => void, Decision[]>();
  const documents = new Set<SourceSegment[]>();
  const sourceKey = (source: SourceSegment[]) => JSON.stringify(source.map(({ id }) => id));
  let visibleSource: SourceSegment[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  function load() {
    if (!storage) return;
    let saved: string | null;
    try { saved = storage.getItem(PERMISSION_STORAGE_KEY); }
    catch { storage = undefined; return; }
    const previous = decisions;
    try {
      decisions = new Map(JSON.parse(saved ?? "[]").map((value: Decision) => {
        if (!value || typeof value.capability !== "string" || typeof value.label !== "string" ||
            (value.allow !== undefined && typeof value.allow !== "boolean")) throw new TypeError("Invalid decision");
        const decision = { ...value, source: validateSource(value.source), allow: value.allow ?? true };
        return [permissionKey(decision), decision];
      }));
    } catch { decisions = new Map(); } // Corrupt saved data must not authorize access.
    for (const [stop, requested] of [...active]) {
      if (requested.some((decision) => previous.get(permissionKey(decision))?.allow &&
          !decisions.get(permissionKey(decision))?.allow)) stop();
    }
  }
  function save() {
    try { storage?.setItem(PERMISSION_STORAGE_KEY, JSON.stringify([...decisions.values()])); }
    catch { storage = undefined; } // Keep the same decisions in memory this session.
  }
  function entries(): PermissionEntry[] {
    const openSources = new Map([...documents].map((source) => [sourceKey(source), source]));
    const rows = new Map<string, PermissionEntry>([...decisions].map(([key, decision]) =>
      [key, { ...decision, remembered: true, active: false }]));
    for (const decision of [...active.values()].flat()) {
      const key = permissionKey(decision);
      rows.set(key, { ...(rows.get(key) ?? { ...decision, remembered: false }), active: true });
    }
    return [...rows.values()].filter((entry) =>
      visibleSource.every((segment, index) => entry.source[index]?.id === segment.id) &&
      (entry.active || openSources.has(sourceKey(entry.source))))
      .map((entry) => ({ ...entry, source: openSources.get(sourceKey(entry.source)) ?? entry.source }));
  }
  function revoke(scope: PermissionScope) {
    const key = permissionKey(scope);
    load();
    decisions.delete(key);
    save();
    for (const [stop, requested] of [...active]) if (requested.some((decision) => permissionKey(decision) === key)) stop();
    ui?.refresh();
  }
  const ui = options.ask ? undefined : createPermissionUI(entries, revoke);
  const ask = options.ask ?? ui!.ask;
  load();
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== PERMISSION_STORAGE_KEY) return;
    load();
    ui?.refresh();
  });
  return {
    registerDocument(source) {
      // Each iframe owns a distinct registration, even when its scope is inherited.
      const document = [...source];
      documents.add(document);
      ui?.refresh();
      return () => { documents.delete(document); ui?.refresh(); };
    },
    show(source) { visibleSource = source; ui?.showManager(); },
    authorize(source, permissions, signal, onRevoke) {
      if (signal.aborted) return Promise.resolve(false);
      const requested = permissions.map((permission) => ({ ...permission, source, allow: true }));
      if (onRevoke) {
        active.set(onRevoke, requested);
        signal.addEventListener("abort", () => { active.delete(onRevoke); ui?.refresh(); }, { once: true });
      }
      const result = queue.then(async () => {
        if (signal.aborted) return false;
        load();
        if (requested.some((decision) => decisions.get(permissionKey(decision))?.allow === false)) return false;
        const missing = requested.filter((decision) => !decisions.has(permissionKey(decision)));
        if (!missing.length) return true;
        const answer = await ask(source, missing, signal);
        if (signal.aborted) return false;
        if (answer.remember) {
          load(); // Merge decisions saved by another tab while the prompt was open.
          if (signal.aborted) return false;
          for (const decision of missing) decisions.set(permissionKey(decision), { ...decision, allow: answer.allow });
          save();
        }
        ui?.refresh();
        return answer.allow;
      });
      queue = result.catch(() => {});
      return result;
    },
    revoke,
  };
}
