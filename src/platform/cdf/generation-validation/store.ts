/**
 * Validation result persistence (M4) — append-only history.
 */

import type { CdfValidationResult } from "./types";

const g = globalThis as typeof globalThis & {
  __cdfValidationStore?: Map<string, CdfValidationResult[]>;
};

function store(): Map<string, CdfValidationResult[]> {
  if (!g.__cdfValidationStore) g.__cdfValidationStore = new Map();
  return g.__cdfValidationStore;
}

function keyOf(artifactId: string, version: number): string {
  return `${artifactId}#${version}`;
}

export function resetCdfValidationStoreForTests(): void {
  g.__cdfValidationStore = new Map();
}

export function saveValidationResult(result: CdfValidationResult): void {
  const k = keyOf(result.artifactId, result.artifactVersion);
  const list = store().get(k) ?? [];
  list.push(structuredClone(result));
  store().set(k, list);
}

export function listValidationResults(
  artifactId: string,
  version: number,
): CdfValidationResult[] {
  return (store().get(keyOf(artifactId, version)) ?? []).map((r) =>
    structuredClone(r),
  );
}

export function getLatestValidationResult(
  artifactId: string,
  version: number,
): CdfValidationResult | undefined {
  const list = store().get(keyOf(artifactId, version));
  if (!list?.length) return undefined;
  return structuredClone(list[list.length - 1]);
}
