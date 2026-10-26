/**
 * Normalize legacy / partial sessions into M1B authoritative shape.
 */

import { CDF_CONTRACT_VERSION } from "../canonical";
import { resolveCdfServiceConfig } from "../service-configs";
import type { CdfSessionState, CdfSessionStatus } from "../types";

/**
 * A session parked on a step the service no longer has (Presentation's Final,
 * removed Oct 2026) resumes completed on the service's last step.
 */
function retireRemovedPhase(session: CdfSessionState): CdfSessionState {
  const phaseId = session.phaseId?.trim();
  if (!phaseId || session.phaseIndex < 0) return session;
  // phaseIndex counts the runtime phase list (contract-only steps excluded).
  const phases = resolveCdfServiceConfig(session.serviceId)?.phases;
  if (!phases?.length || phases.some((p) => p.id === phaseId)) return session;
  if (phaseId !== "final") return session;
  const lastIndex = phases.length - 1;
  return {
    ...session,
    phaseIndex: lastIndex,
    phaseId: phases[lastIndex]!.id,
    status: "completed",
  };
}

export function normalizeCdfSession(input: CdfSessionState): CdfSessionState {
  const session = retireRemovedPhase(input);
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
