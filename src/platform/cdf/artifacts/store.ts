/**
 * Persistence for CDF canonical artifacts (M3A).
 * Memory-first (sync) + optional Mongo best-effort, matching Requirement Engine.
 * Separate from enterprise_artifacts (execution media).
 *
 * After process restart, call ensureCdfArtifactBagLoaded() before sync lookups —
 * session refs alone are not enough (same pattern as requirement bags).
 */

import type {
  CdfCanonicalArtifact,
  CdfArtifactVersionRecord,
} from "./types";
import type { CdfArtifactBagSnapshot } from "../../infrastructure/durability/mongo/models/cdf-artifact.model";

type IdempotencyRow = {
  requestId: string;
  artifactId: string;
  version: number;
  createdAt: string;
};

type MemoryState = {
  artifacts: Map<string, CdfCanonicalArtifact>;
  versions: Map<string, CdfArtifactVersionRecord>;
  idempotency: Map<string, IdempotencyRow>;
};

const g = globalThis as typeof globalThis & {
  __cdfArtifactStore?: MemoryState;
  __cdfArtifactBagHydrated?: boolean;
  __cdfArtifactBagHydratePromise?: Promise<void> | null;
};

function mem(): MemoryState {
  if (!g.__cdfArtifactStore) {
    g.__cdfArtifactStore = {
      artifacts: new Map(),
      versions: new Map(),
      idempotency: new Map(),
    };
  }
  return g.__cdfArtifactStore;
}

function versionKey(artifactId: string, version: number): string {
  return `${artifactId}#${version}`;
}

export function resetCdfArtifactStoreForTests(): void {
  g.__cdfArtifactStore = {
    artifacts: new Map(),
    versions: new Map(),
    idempotency: new Map(),
  };
  g.__cdfArtifactBagHydrated = false;
  g.__cdfArtifactBagHydratePromise = null;
}

function snapshot(): {
  artifacts: CdfCanonicalArtifact[];
  versions: CdfArtifactVersionRecord[];
  idempotency: IdempotencyRow[];
} {
  return {
    artifacts: [...mem().artifacts.values()].map((a) => structuredClone(a)),
    versions: [...mem().versions.values()].map((v) => structuredClone(v)),
    idempotency: [...mem().idempotency.values()].map((r) => ({ ...r })),
  };
}

function persistBestEffort(): void {
  void (async () => {
    try {
      const { persistCdfArtifactBagToMongo } = await import(
        "../../infrastructure/durability/mongo/models/cdf-artifact.model"
      );
      await persistCdfArtifactBagToMongo(snapshot());
    } catch {
      // Mongo optional
    }
  })();
}

export function storeGetArtifact(
  artifactId: string,
): CdfCanonicalArtifact | null {
  const a = mem().artifacts.get(artifactId);
  return a ? structuredClone(a) : null;
}

export function storeInsertArtifact(artifact: CdfCanonicalArtifact): void {
  if (mem().artifacts.has(artifact.artifactId)) {
    throw new Error(`Artifact already exists: ${artifact.artifactId}`);
  }
  mem().artifacts.set(artifact.artifactId, structuredClone(artifact));
  persistBestEffort();
}

export function storeReplaceArtifact(
  artifact: CdfCanonicalArtifact,
  expectedLatestVersion: number,
): boolean {
  const cur = mem().artifacts.get(artifact.artifactId);
  if (!cur || cur.latestVersion !== expectedLatestVersion) return false;
  mem().artifacts.set(artifact.artifactId, structuredClone(artifact));
  persistBestEffort();
  return true;
}

export function storeGetVersion(
  artifactId: string,
  version: number,
): CdfArtifactVersionRecord | null {
  const v = mem().versions.get(versionKey(artifactId, version));
  return v ? structuredClone(v) : null;
}

export function storeInsertVersion(
  record: CdfArtifactVersionRecord,
): "ok" | "duplicate" {
  const k = versionKey(record.artifactId, record.version);
  if (mem().versions.has(k)) return "duplicate";
  mem().versions.set(k, structuredClone(record));
  persistBestEffort();
  return "ok";
}

/** Rollback helper — only for failed CAS after insert (never for approved creative undo). */
export function storeDeleteVersion(
  artifactId: string,
  version: number,
): boolean {
  const k = versionKey(artifactId, version);
  if (!mem().versions.has(k)) return false;
  mem().versions.delete(k);
  persistBestEffort();
  return true;
}

/**
 * Atomic allocate: check expectedLatest → insert next version → CAS head update.
 * Single sync critical section per artifact (memory/test authority).
 * Returns "conflict" if expectedLatest mismatches or version key exists.
 */
export function storeAllocateNextVersion(input: {
  artifactId: string;
  expectedLatestVersion: number;
  buildVersion: (
    nextVersion: number,
    head: CdfCanonicalArtifact,
  ) => CdfArtifactVersionRecord;
  patchHead: (
    head: CdfCanonicalArtifact,
    nextVersion: number,
    createdAt: string,
  ) => CdfCanonicalArtifact;
}):
  | {
      ok: true;
      artifact: CdfCanonicalArtifact;
      version: CdfArtifactVersionRecord;
    }
  | { ok: false; reason: "conflict" | "not_found" | "duplicate" } {
  const locks = (g as typeof g & {
    __cdfArtifactAllocLocks?: Map<string, number>;
  }).__cdfArtifactAllocLocks ??
    ((g as typeof g & { __cdfArtifactAllocLocks?: Map<string, number> })
      .__cdfArtifactAllocLocks = new Map());

  // Re-entrant-safe spin: JS is single-threaded; lock prevents overlapping
  // async continuations from interleaving incorrectly if any await sneaks in.
  // Sync createVersion never awaits inside this section.
  const artifactId = input.artifactId;
  if (locks.get(artifactId)) {
    return { ok: false, reason: "conflict" };
  }
  locks.set(artifactId, 1);
  try {
    const head = mem().artifacts.get(artifactId);
    if (!head) return { ok: false, reason: "not_found" };
    if (head.latestVersion !== input.expectedLatestVersion) {
      return { ok: false, reason: "conflict" };
    }
    const nextVersion = head.latestVersion + 1;
    const record = input.buildVersion(nextVersion, head);
    const k = versionKey(artifactId, nextVersion);
    if (mem().versions.has(k)) return { ok: false, reason: "duplicate" };
    mem().versions.set(k, structuredClone(record));
    const updated = input.patchHead(head, nextVersion, record.createdAt);
    // CAS: re-check latestVersion still matches (another sync caller shouldn't
    // have mutated under the lock; still verify for safety).
    const cur = mem().artifacts.get(artifactId);
    if (!cur || cur.latestVersion !== input.expectedLatestVersion) {
      mem().versions.delete(k);
      return { ok: false, reason: "conflict" };
    }
    mem().artifacts.set(artifactId, structuredClone(updated));
    persistBestEffort();
    return {
      ok: true,
      artifact: structuredClone(updated),
      version: structuredClone(record),
    };
  } finally {
    locks.delete(artifactId);
  }
}

export function storeListVersions(
  artifactId: string,
): CdfArtifactVersionRecord[] {
  return [...mem().versions.values()]
    .filter((v) => v.artifactId === artifactId)
    .sort((a, b) => a.version - b.version)
    .map((v) => structuredClone(v));
}

export function storeGetIdempotency(
  requestId: string,
): IdempotencyRow | null {
  const row = mem().idempotency.get(requestId);
  return row ? { ...row } : null;
}

export function storePutIdempotency(
  row: IdempotencyRow,
): "ok" | "conflict" {
  const existing = mem().idempotency.get(row.requestId);
  if (existing) {
    if (
      existing.artifactId === row.artifactId &&
      existing.version === row.version
    ) {
      return "ok";
    }
    return "conflict";
  }
  mem().idempotency.set(row.requestId, { ...row });
  persistBestEffort();
  return "ok";
}

/** Update version status fields only (not creative data). */
export function storePatchVersionStatus(
  artifactId: string,
  version: number,
  patch: Partial<
    Pick<
      CdfArtifactVersionRecord,
      "status" | "selectedAt" | "approvedAt"
    >
  >,
): CdfArtifactVersionRecord | null {
  const cur = mem().versions.get(versionKey(artifactId, version));
  if (!cur) return null;
  const next = { ...cur, ...patch };
  mem().versions.set(versionKey(artifactId, version), next);
  persistBestEffort();
  return structuredClone(next);
}

export async function ensureCdfArtifactIndexes(): Promise<void> {
  // Indexes declared on mongoose schema; no-op when Mongo unavailable.
  try {
    await import(
      "../../infrastructure/durability/mongo/models/cdf-artifact.model"
    );
  } catch {
    // optional
  }
}

/**
 * Apply a durable bag snapshot into memory without write-back.
 * Existing in-memory rows win (warm process / newer local CAS).
 */
export function hydrateCdfArtifactBagFromSnapshot(
  snap: CdfArtifactBagSnapshot,
): void {
  const m = mem();
  for (const a of snap.artifacts ?? []) {
    if (!a?.artifactId) continue;
    if (!m.artifacts.has(a.artifactId)) {
      m.artifacts.set(a.artifactId, structuredClone(a));
    }
  }
  for (const v of snap.versions ?? []) {
    if (!v?.artifactId || !Number.isInteger(v.version)) continue;
    const k = versionKey(v.artifactId, v.version);
    if (!m.versions.has(k)) {
      m.versions.set(k, structuredClone(v));
    }
  }
  for (const row of snap.idempotency ?? []) {
    if (!row?.requestId) continue;
    if (!m.idempotency.has(row.requestId)) {
      m.idempotency.set(row.requestId, { ...row });
    }
  }
  g.__cdfArtifactBagHydrated = true;
}

/**
 * Hydrate the global ArtifactVersion bag from Mongo when memory is cold.
 * Exact X@V lookups (getArtifactVersion) are sync and memory-backed —
 * this must run before dependency/context resolution after restart.
 *
 * Cache is an optimization only: empty memory falls through to Mongo.
 */
export async function ensureCdfArtifactBagLoaded(): Promise<void> {
  const m = mem();
  if (g.__cdfArtifactBagHydrated) return;
  if (m.artifacts.size > 0 || m.versions.size > 0) {
    g.__cdfArtifactBagHydrated = true;
    return;
  }
  if (g.__cdfArtifactBagHydratePromise) {
    await g.__cdfArtifactBagHydratePromise;
    return;
  }

  g.__cdfArtifactBagHydratePromise = (async () => {
    try {
      const { loadCdfArtifactBagFromMongo } = await import(
        "../../infrastructure/durability/mongo/models/cdf-artifact.model"
      );
      const loaded = await loadCdfArtifactBagFromMongo();
      if (loaded) {
        hydrateCdfArtifactBagFromSnapshot(loaded);
      } else {
        g.__cdfArtifactBagHydrated = true;
      }
    } catch {
      // Mongo optional for unit tests without a connection
      g.__cdfArtifactBagHydrated = true;
    } finally {
      g.__cdfArtifactBagHydratePromise = null;
    }
  })();

  await g.__cdfArtifactBagHydratePromise;
}

/** Awaitable flush of the current memory bag (tests + durability-required paths). */
export async function flushCdfArtifactBagToMongo(): Promise<void> {
  const { persistCdfArtifactBagToMongo } = await import(
    "../../infrastructure/durability/mongo/models/cdf-artifact.model"
  );
  await persistCdfArtifactBagToMongo(snapshot());
}

export function getCdfArtifactBagSnapshotForTests(): CdfArtifactBagSnapshot {
  return snapshot();
}
