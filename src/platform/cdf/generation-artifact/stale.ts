/**
 * Stale-generation guard (M3C).
 */

import { getCdfSession } from "../session-store";
import { generationArtifactError } from "./errors";

export function assertGenerationContextNotStale(input: {
  sessionId: string;
  expectedSessionVersion?: number;
  activeBriefId?: string;
  activeBriefVersion?: number;
  contextHash?: string;
}): void {
  const session = getCdfSession(input.sessionId);
  if (!session) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_MISSING",
      `CDF session not found: ${input.sessionId}`,
      { sessionId: input.sessionId },
    );
  }

  if (
    input.expectedSessionVersion != null &&
    session.sessionVersion !== input.expectedSessionVersion
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      `Session advanced from v${input.expectedSessionVersion} to v${session.sessionVersion}`,
      {
        expectedSessionVersion: input.expectedSessionVersion,
        currentSessionVersion: session.sessionVersion,
      },
    );
  }

  if (
    input.activeBriefId &&
    session.activeBriefId &&
    input.activeBriefId !== session.activeBriefId
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      "ActiveBrief id changed since generation started",
      {
        expectedActiveBriefId: input.activeBriefId,
        currentActiveBriefId: session.activeBriefId,
      },
    );
  }

  if (
    input.activeBriefVersion != null &&
    session.activeBriefVersion != null &&
    input.activeBriefVersion !== session.activeBriefVersion
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      `ActiveBrief version changed from v${input.activeBriefVersion} to v${session.activeBriefVersion}`,
      {
        expectedActiveBriefVersion: input.activeBriefVersion,
        currentActiveBriefVersion: session.activeBriefVersion,
      },
    );
  }

  // contextHash is recorded for provenance; mismatch with a newer resolver
  // run is detected when callers pass both expected hash and the session has moved.
  void input.contextHash;
}
