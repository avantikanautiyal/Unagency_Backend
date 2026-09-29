/**
 * Normalize legacy / partial sessions into M1B authoritative shape.
 */

import { CDF_CONTRACT_VERSION } from "../canonical";
import type { CdfSessionState, CdfSessionStatus } from "../types";

export function normalizeCdfSession(session: CdfSessionState): CdfSessionState {
  const status: CdfSessionStatus =
    session.status ??
    (session.modeOwnership === "studio"
      ? "handed_off"
      : session.phaseIndex < 0
        ? "awaiting_brief"
        : "active");

  return {
    ...session,
    contractVersion: session.contractVersion ?? CDF_CONTRACT_VERSION,
    sessionVersion:
      typeof session.sessionVersion === "number" && session.sessionVersion >= 0
        ? session.sessionVersion
        : 0,
    status,
    selected: Array.isArray(session.selected) ? session.selected : [],
    approved: Array.isArray(session.approved) ? session.approved : [],
    masters: session.masters ?? {},
  };
}

export function bumpSessionVersion(
  session: CdfSessionState,
  patch: Partial<CdfSessionState>,
): CdfSessionState {
  const base = normalizeCdfSession(session);
  return normalizeCdfSession({
    ...base,
    ...patch,
    sessionVersion: base.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  });
}
