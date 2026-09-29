/**
 * Refinement request persistence (append-only) — M6.
 */

import type { CdfRefinementRequest } from "./types";

const g = globalThis as typeof globalThis & {
  __cdfRefinementStore?: Map<string, CdfRefinementRequest>;
};

function store(): Map<string, CdfRefinementRequest> {
  if (!g.__cdfRefinementStore) g.__cdfRefinementStore = new Map();
  return g.__cdfRefinementStore;
}

export function resetCdfRefinementStoreForTests(): void {
  g.__cdfRefinementStore = new Map();
}

export function saveRefinementRequest(
  req: CdfRefinementRequest,
): CdfRefinementRequest {
  const clone = structuredClone(req);
  store().set(clone.refinementId, clone);
  return structuredClone(clone);
}

export function getRefinementRequest(
  refinementId: string,
): CdfRefinementRequest | undefined {
  const r = store().get(refinementId);
  return r ? structuredClone(r) : undefined;
}

export function listRefinementRequests(
  sessionId?: string,
): CdfRefinementRequest[] {
  return [...store().values()]
    .filter((r) => !sessionId || r.sessionId === sessionId)
    .map((r) => structuredClone(r));
}
