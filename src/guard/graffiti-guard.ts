import { reactive } from "vue";
import type { GraffitiGuardRequest } from "../backend/graffiti-server";

export type PendingGraffitiGuardRequest = GraffitiGuardRequest & { id: number };

export const graffitiGuardState = reactive({
  pending: [] as PendingGraffitiGuardRequest[],
});

const grantedRequestSignaturesBySourceId = new Map<string, Set<string>>();
const pendingHandlers = new Map<
  number,
  { resolve: () => void; reject: (error: Error) => void }
>();
let nextGuardRequestId = 1;

function requestSignatureReplacer(_key: string, value: unknown) {
  if (value instanceof ArrayBuffer) {
    return { __type: "ArrayBuffer", byteLength: value.byteLength };
  }
  return value;
}

function getRequestSignature(
  request: Pick<GraffitiGuardRequest, "method" | "args">,
): string | undefined {
  try {
    return JSON.stringify(
      [request.method, request.args],
      requestSignatureReplacer,
    );
  } catch {
    return;
  }
}

function getRequestSourceCacheKey(request: GraffitiGuardRequest): string | undefined {
  if (request.transcludeId === null) return;
  return request.transcludeId;
}

function hasGrantedRequest(request: GraffitiGuardRequest): boolean {
  const signature = getRequestSignature(request);
  if (!signature) return false;
  const sourceKey = getRequestSourceCacheKey(request);
  if (!sourceKey) return false;
  return grantedRequestSignaturesBySourceId.get(sourceKey)?.has(signature) ?? false;
}

function rememberGrantedRequest(request: GraffitiGuardRequest) {
  const signature = getRequestSignature(request);
  if (!signature) return;
  const sourceKey = getRequestSourceCacheKey(request);
  if (!sourceKey) return;

  let signatures = grantedRequestSignaturesBySourceId.get(sourceKey);
  if (!signatures) {
    signatures = new Set<string>();
    grantedRequestSignaturesBySourceId.set(sourceKey, signatures);
  }
  signatures.add(signature);
}

function removePendingById(
  id: number,
): PendingGraffitiGuardRequest | undefined {
  const index = graffitiGuardState.pending.findIndex(
    (request) => request.id === id,
  );
  if (index < 0) return;
  const [removed] = graffitiGuardState.pending.splice(index, 1);
  return removed;
}

function settlePending(
  id: number,
  allow: boolean,
  reason = "Request blocked by guard",
) {
  const request = removePendingById(id);
  const handlers = pendingHandlers.get(id);
  if (!handlers) return;

  pendingHandlers.delete(id);
  if (allow) {
    if (request) {
      rememberGrantedRequest(request);
    }
    handlers.resolve();
    return;
  }

  const method = request?.method ?? "request";
  handlers.reject(new Error(`${reason} (${method})`));
}

export function handleGraffitiGuardRequest(
  request: GraffitiGuardRequest,
): Promise<void> {
  if (hasGrantedRequest(request)) {
    return Promise.resolve();
  }

  const id = nextGuardRequestId++;
  graffitiGuardState.pending.push({ ...request, id });
  return new Promise<void>((resolve, reject) => {
    pendingHandlers.set(id, { resolve, reject });
  });
}

export function allowGraffitiGuardRequest(id: number) {
  settlePending(id, true);
}

export function denyGraffitiGuardRequest(
  id: number,
  reason = "Request blocked by user",
) {
  settlePending(id, false, reason);
}
