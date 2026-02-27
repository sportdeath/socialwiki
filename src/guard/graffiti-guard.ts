import { reactive } from "vue";
import type { GraffitiGuardRequest } from "../backend/graffiti-server";
import {
  hasMatchingGraffitiGuardApprovalRule,
  saveGraffitiGuardApprovalRule,
} from "./graffiti-guard-approval-rules";

export type PendingGraffitiGuardRequest = GraffitiGuardRequest & {
  id: number;
  accept: () => void;
  reject: (error: Error) => void;
};

export const graffitiGuardState = reactive({
  pending: [] as PendingGraffitiGuardRequest[],
});

let nextGuardRequestId = 1;
export async function handleGraffitiGuardRequest(
  request: GraffitiGuardRequest,
): Promise<void> {
  if (await hasMatchingGraffitiGuardApprovalRule(request)) {
    return;
  }

  const id = nextGuardRequestId++;
  const pendingRequest: PendingGraffitiGuardRequest = {
    ...request,
    id,
    accept: () => {},
    reject: () => {},
  };

  const promise = new Promise<void>((resolve, reject) => {
    pendingRequest.accept = resolve;
    pendingRequest.reject = reject;
  });

  graffitiGuardState.pending.push(pendingRequest);
  return promise;
}

function settlePending(id: number, allow: boolean) {
  const index = graffitiGuardState.pending.findIndex(
    (request) => request.id === id,
  );
  if (index < 0) return;

  const [request] = graffitiGuardState.pending.splice(index, 1);

  if (allow) {
    request.accept();
  } else {
    request.reject(new Error(`Request blocked by user`));
  }
}

export function allowGraffitiGuardRequest(id: number) {
  settlePending(id, true);
}

export function denyGraffitiGuardRequest(id: number) {
  settlePending(id, false);
}

async function allowWithStoredRule(
  id: number,
  scope: "similar" | "all",
): Promise<void> {
  const request = graffitiGuardState.pending.find((pending) => pending.id === id);
  if (!request) return;

  try {
    await saveGraffitiGuardApprovalRule(request, scope);
  } catch {
    // Approval should still go through even if storage is unavailable.
  }

  allowGraffitiGuardRequest(id);
}

export function allowSimilarGraffitiGuardRequest(id: number) {
  return allowWithStoredRule(id, "similar");
}

export function allowAlwaysGraffitiGuardRequest(id: number) {
  return allowWithStoredRule(id, "all");
}
