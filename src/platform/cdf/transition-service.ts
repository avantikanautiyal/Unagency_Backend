/**
 * CDF transition facade (M1B).
 *
 * Authoritative transitions live in ./state-machine/execute-action.
 * Unlocked pre-CAS executor snapshot removed — SM is sole writer.
 */

import { failure, success, type Result } from "../core/result";
import { resolveCdfServiceConfig } from "./service-configs";
import { getCdfSession } from "./session-store";
import {
  executeCdfAction,
  resolveAuthoritativeNextWork,
  buildAuthoritativeUi,
} from "./state-machine/execute-action";
import { normalizeCdfSession } from "./state-machine/normalize";
import { cdfError } from "./state-machine/errors";
import type { CdfTransitionRequest, CdfTransitionResult } from "./types";

/** @deprecated Prefer executeCdfAction — kept as the public sync entry for callers. */
export function applyCdfTransition(
  req: CdfTransitionRequest,
): Result<CdfTransitionResult> {
  return executeCdfAction(req);
}

export function getCdfSessionResult(
  sessionId: string,
): Result<CdfTransitionResult> {
  const raw = getCdfSession(sessionId);
  if (!raw) {
    return failure(
      cdfError("SESSION_NOT_FOUND", `CDF session not found: ${sessionId}`, {
        sessionId,
      }),
    );
  }
  const session = normalizeCdfSession(raw);
  const config = resolveCdfServiceConfig(session.serviceId);
  if (!config) {
    return failure(
      cdfError("INVALID_SERVICE", `Unknown CDF service: ${session.serviceId}`),
    );
  }
  const nextWork = resolveAuthoritativeNextWork(config, session);
  return success({
    session,
    config,
    ui: buildAuthoritativeUi(config, session),
    nextWork,
    version: session.sessionVersion,
  });
}
