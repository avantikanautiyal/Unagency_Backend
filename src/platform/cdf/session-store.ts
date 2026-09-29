/**
 * In-memory CDF session store with optimistic concurrency (M1B).
 * Mongo backs durability when connected; memory remains the hot path + test fallback.
 *
 * When durability is required (Mongo connected, or ENTERPRISE_API_DURABLE_MODE),
 * persist failures are fail-closed — callers must not treat the session as durable.
 */

import { ValidationError } from "../core/errors";
import type { CdfSessionState } from "./types";
import { normalizeCdfSession } from "./state-machine/normalize";

const sessions = new Map<string, CdfSessionState>();

export function createCdfSessionId(): string {
  return `cdf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCdfSession(sessionId: string): CdfSessionState | undefined {
  const raw = sessions.get(sessionId);
  return raw ? normalizeCdfSession(raw) : undefined;
}

export function saveCdfSession(session: CdfSessionState): CdfSessionState {
  const normalized = normalizeCdfSession(session);
  sessions.set(normalized.sessionId, normalized);
  return normalized;
}

/**
 * Compare-and-swap on sessionVersion.
 * Returns the saved session on success, or undefined if version mismatched / missing.
 */
export function compareAndSwapCdfSession(
  sessionId: string,
  expectedVersion: number,
  next: CdfSessionState,
): CdfSessionState | undefined {
  const current = sessions.get(sessionId);
  if (!current) return undefined;
  const normalized = normalizeCdfSession(current);
  if (normalized.sessionVersion !== expectedVersion) {
    return undefined;
  }
  const saved = normalizeCdfSession({
    ...next,
    sessionVersion: expectedVersion + 1,
  });
  sessions.set(sessionId, saved);
  return saved;
}

export function deleteCdfSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/** Test helper — clears all sessions. */
export function resetCdfSessionsForTests(): void {
  sessions.clear();
}

export type CdfSessionDurabilityMode = "required" | "optional";

/**
 * Durability policy for CDF sessions (framework-level, not service-specific).
 * - required: Mongo must accept the write; failure throws
 * - optional: memory-only ok (unit tests without Mongo)
 */
export function resolveCdfSessionDurabilityMode(): CdfSessionDurabilityMode {
  const override = String(process.env.CDF_SESSION_DURABILITY ?? "")
    .trim()
    .toLowerCase();
  if (override === "optional" || override === "off") return "optional";
  if (override === "required" || override === "on") return "required";
  // Connected Mongo ⇒ silent skip is forbidden (HTTP product path).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mongoose = require("mongoose") as typeof import("mongoose");
    if (mongoose.connection?.readyState === 1) return "required";
  } catch {
    // ignore
  }
  return "optional";
}

export type PersistCdfSessionResult = {
  readonly session: CdfSessionState;
  /** True only when Mongo accepted the write. */
  readonly durable: boolean;
};

function durabilityError(
  sessionId: string,
  reason: string,
  message?: string,
): ValidationError {
  return new ValidationError(
    message ??
      `CDF session durability failed (sessionId=${sessionId} reason=${reason})`,
    {
      reason: "CDF_SESSION_DURABILITY_FAILED",
      sessionId,
      durabilityReason: reason,
    },
  );
}

/**
 * Ensure session is in memory — hydrate from Mongo on miss.
 * Always co-hydrates the requirement bag (ActiveBrief source of truth)
 * so context resolution can resolve exact activeBriefId@version after restart.
 */
export async function ensureCdfSessionLoaded(
  sessionId: string,
): Promise<CdfSessionState | undefined> {
  let session: CdfSessionState | undefined;
  const cached = sessions.get(sessionId);
  if (cached) {
    session = normalizeCdfSession(cached);
  } else {
    try {
      const { loadCdfSessionFromMongo } = await import(
        "../infrastructure/durability/mongo/models/cdf-session.model"
      );
      const loaded = await loadCdfSessionFromMongo(sessionId);
      if (loaded) {
        session = normalizeCdfSession(loaded);
        sessions.set(sessionId, session);
      }
    } catch (err) {
      if (resolveCdfSessionDurabilityMode() === "required") {
        throw durabilityError(
          sessionId,
          "load_failed",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // Framework co-rehydration: session pointers (activeBriefId@version) are
  // useless unless the requirement bag is in memory.
  try {
    const { ensureRequirementBagLoaded } = await import("./requirements/store");
    await ensureRequirementBagLoaded(sessionId);
  } catch (err) {
    if (resolveCdfSessionDurabilityMode() === "required") {
      throw durabilityError(
        sessionId,
        "requirement_bag_load_failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Framework co-rehydration: selectedArtifacts / generatedArtifacts are refs
  // only — ArtifactVersion payloads live in the canonical artifact bag.
  try {
    const { ensureCdfArtifactBagLoaded } = await import("./artifacts/store");
    await ensureCdfArtifactBagLoaded();
  } catch (err) {
    if (resolveCdfSessionDurabilityMode() === "required") {
      throw durabilityError(
        sessionId,
        "artifact_bag_load_failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return session;
}

/**
 * Persist session to Mongo (upsert) and keep memory copy.
 * Fail-closed when durability is required.
 */
export async function persistCdfSession(
  session: CdfSessionState,
): Promise<CdfSessionState> {
  const incoming = normalizeCdfSession(session);
  const current = sessions.get(incoming.sessionId);
  const currentNorm = current ? normalizeCdfSession(current) : undefined;

  // Guard stale fire-and-forget persists (e.g. start → async persist after
  // brief/select already advanced sessionVersion). Never regress in-memory state.
  if (
    currentNorm &&
    currentNorm.sessionVersion > incoming.sessionVersion
  ) {
    return currentNorm;
  }

  const saved = saveCdfSession(incoming);
  const mode = resolveCdfSessionDurabilityMode();
  try {
    const { persistCdfSessionToMongo } = await import(
      "../infrastructure/durability/mongo/models/cdf-session.model"
    );
    const written = await persistCdfSessionToMongo(saved);
    if (written.ok) {
      return saved;
    }
    if (mode === "required") {
      throw durabilityError(saved.sessionId, written.reason, written.message);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    if (mode === "required") {
      throw durabilityError(
        saved.sessionId,
        "write_failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return saved;
}

/**
 * Atomic version-checked persist (memory CAS + Mongo CAS when available).
 * Returns undefined on version conflict (memory or Mongo).
 * Fail-closed when durability is required and Mongo cannot accept the write.
 */
export async function persistCdfSessionCas(
  expectedVersion: number,
  next: CdfSessionState,
): Promise<CdfSessionState | undefined> {
  const prior = sessions.get(next.sessionId)
    ? normalizeCdfSession(sessions.get(next.sessionId)!)
    : undefined;

  const swapped = compareAndSwapCdfSession(
    next.sessionId,
    expectedVersion,
    next,
  );
  if (!swapped) return undefined;

  const mode = resolveCdfSessionDurabilityMode();
  try {
    const { persistCdfSessionCasToMongo, persistCdfSessionToMongo } =
      await import(
        "../infrastructure/durability/mongo/models/cdf-session.model"
      );
    const mongoOk = await persistCdfSessionCasToMongo(expectedVersion, swapped);
    if (mongoOk.ok) {
      return swapped;
    }
    if (
      mongoOk.reason === "mongo_unavailable" ||
      mongoOk.reason === "model_unavailable"
    ) {
      if (mode === "required") {
        if (prior) sessions.set(next.sessionId, prior);
        else sessions.delete(next.sessionId);
        throw durabilityError(swapped.sessionId, mongoOk.reason, mongoOk.message);
      }
      return swapped;
    }
    if (mongoOk.reason === "cas_conflict") {
      if (prior) {
        sessions.set(next.sessionId, prior);
      } else {
        sessions.delete(next.sessionId);
      }
      return undefined;
    }
    if (mode === "required") {
      if (prior) {
        sessions.set(next.sessionId, prior);
      } else {
        sessions.delete(next.sessionId);
      }
      throw durabilityError(swapped.sessionId, mongoOk.reason, mongoOk.message);
    }
    // Optional durability: keep memory; best-effort upsert for later hydrate.
    await persistCdfSessionToMongo(swapped);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    if (mode === "required") {
      if (prior) {
        sessions.set(next.sessionId, prior);
      } else {
        sessions.delete(next.sessionId);
      }
      throw durabilityError(
        swapped.sessionId,
        "write_failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return swapped;
}

/**
 * After any in-memory session mutation (bind/select/approve), flush durable store.
 * Framework helper — not service-specific.
 */
export async function flushCdfSessionDurability(
  sessionId: string,
): Promise<CdfSessionState> {
  const live = getCdfSession(sessionId);
  if (!live) {
    throw durabilityError(sessionId, "session_missing");
  }
  return persistCdfSession(live);
}
