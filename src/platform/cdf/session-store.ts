/**
 * In-memory CDF session store (hot path).
 * Mongo snapshot backs restarts when connection is available.
 */

import type { CdfSessionState } from "./types";

const sessions = new Map<string, CdfSessionState>();

export function createCdfSessionId(): string {
  return `cdf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCdfSession(sessionId: string): CdfSessionState | undefined {
  return sessions.get(sessionId);
}

export function saveCdfSession(session: CdfSessionState): CdfSessionState {
  sessions.set(session.sessionId, session);
  return session;
}

export function deleteCdfSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/** Test helper — clears all sessions. */
export function resetCdfSessionsForTests(): void {
  sessions.clear();
}

/**
 * Ensure session is in memory — hydrate from Mongo on miss.
 */
export async function ensureCdfSessionLoaded(
  sessionId: string
): Promise<CdfSessionState | undefined> {
  const cached = sessions.get(sessionId);
  if (cached) return cached;
  try {
    const { loadCdfSessionFromMongo } = await import(
      "../infrastructure/durability/mongo/models/cdf-session.model"
    );
    const loaded = await loadCdfSessionFromMongo(sessionId);
    if (loaded) {
      sessions.set(sessionId, loaded);
      return loaded;
    }
  } catch {
    // Mongo optional — ignore
  }
  return undefined;
}

/** Persist session to Mongo (best-effort). Always keeps memory copy. */
export async function persistCdfSession(
  session: CdfSessionState
): Promise<CdfSessionState> {
  saveCdfSession(session);
  try {
    const { persistCdfSessionToMongo } = await import(
      "../infrastructure/durability/mongo/models/cdf-session.model"
    );
    await persistCdfSessionToMongo(session);
  } catch {
    // Best-effort durability
  }
  return session;
}
