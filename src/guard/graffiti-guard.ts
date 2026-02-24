import { reactive } from "vue";
import type { GraffitiGuardRequest } from "../backend/graffiti-server";

export type PendingGraffitiGuardRequest = GraffitiGuardRequest & {
  id: number;
  accept: () => void;
  reject: (error: Error) => void;
};

export const graffitiGuardState = reactive({
  pending: [] as PendingGraffitiGuardRequest[],
});

let nextGuardRequestId = 1;
export function handleGraffitiGuardRequest(
  request: GraffitiGuardRequest,
): Promise<void> {
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
