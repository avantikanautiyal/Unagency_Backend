/**
 * M9C — Social Media ArtifactVersion → session integration.
 *
 * Consumes the exact identity returned by M9B (cdfArtifactId@version).
 * Does NOT re-run normalization / M4 / ArtifactVersion creation.
 * Does NOT mutate selectedArtifacts or approvedArtifacts (select/approve SM owns those).
 *
 * generatedArtifacts bind uses M1B CAS (expectedVersion → sessionVersion++).
 * CAS conflicts are reconciled against live session version (exact ID/version preserved).
 */

import type { CdfSessionState } from "../types";
import { CdfArtifactError } from "../artifacts/errors";
import { getCdfSession } from "../session-store";
import type { SocialMediaCanonicalAttach } from "./ingest-bridge";
import { bindGeneratedSocialMediaArtifactToSession } from "./session-bind";

export type BindSocialMediaGeneratedResult =
  | {
      ok: true;
      session: CdfSessionState;
      idempotentReplay?: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
      currentVersion?: number;
      expectedVersion?: number;
    };

const MAX_CAS_RETRIES = 3;

function logM9cBind(meta: Record<string, unknown>): void {
  try {
    console.info(
      JSON.stringify({
        scope: "cdf.social_media_runtime",
        event: "m9c_generated_bind",
        ...meta,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore logging failures
  }
}

/**
 * Bind M9B attach identity into session.generatedArtifacts as exact pin (CAS).
 * On SESSION_VERSION_CONFLICT: re-read live sessionVersion and retry with the
 * same immutable artifactId@version (never create a different artifact).
 */
export function bindSocialMediaGeneratedFromAttach(input: {
  sessionId: string;
  phaseId: string;
  attach: Pick<
    SocialMediaCanonicalAttach,
    "cdfArtifactId" | "cdfArtifactVersion" | "cdfArtifactKey"
  >;
  organizationId?: string;
  projectId?: string;
  expectedVersion?: number;
  maxCasRetries?: number;
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  generationExecutionId?: string;
  generationFanoutLeaf?: boolean;
}): BindSocialMediaGeneratedResult {
  const artifactId = input.attach.cdfArtifactId;
  const artifactVersion = input.attach.cdfArtifactVersion;
  const artifactKey = input.attach.cdfArtifactKey;
  const maxRetries = input.maxCasRetries ?? MAX_CAS_RETRIES;

  try {
    let expectedVersion =
      typeof input.expectedVersion === "number"
        ? input.expectedVersion
        : getCdfSession(input.sessionId)?.sessionVersion;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const live = getCdfSession(input.sessionId);
      if (!live) {
        logM9cBind({
          ok: false,
          code: "SESSION_NOT_FOUND",
          sessionId: input.sessionId,
          phaseId: input.phaseId,
          artifactKey,
          artifactId,
          artifactVersion,
        });
        return {
          ok: false,
          code: "SESSION_NOT_FOUND",
          message: `CDF session not found: ${input.sessionId}`,
        };
      }

      if (typeof expectedVersion !== "number") {
        expectedVersion = live.sessionVersion;
      }

      const result = bindGeneratedSocialMediaArtifactToSession({
        sessionId: input.sessionId,
        phaseId: input.phaseId,
        artifactId,
        version: artifactVersion,
        artifactKey,
        organizationId: input.organizationId,
        projectId: input.projectId,
        expectedVersion,
        generationFanoutGroupId: input.generationFanoutGroupId,
        generationFanoutTargetId: input.generationFanoutTargetId,
        generationExecutionId: input.generationExecutionId,
        generationFanoutLeaf:
          input.generationFanoutLeaf === true ||
          Boolean(input.generationFanoutGroupId?.trim()) ||
          Boolean(input.generationFanoutTargetId?.trim()) ||
          undefined,
      });

      if (result.ok) {
        logM9cBind({
          ok: true,
          sessionId: input.sessionId,
          phaseId: input.phaseId,
          artifactKey,
          artifactId,
          artifactVersion,
          sessionVersion: result.session.sessionVersion,
          idempotentReplay: result.idempotentReplay === true,
          casAttempt: attempt,
        });
        return {
          ok: true,
          session: result.session,
          ...(result.idempotentReplay ? { idempotentReplay: true } : {}),
        };
      }

      if (
        result.code === "SESSION_VERSION_CONFLICT" &&
        attempt < maxRetries
      ) {
        const refreshed = getCdfSession(input.sessionId);
        expectedVersion = refreshed?.sessionVersion;
        logM9cBind({
          ok: false,
          code: "SESSION_VERSION_CONFLICT",
          retrying: true,
          sessionId: input.sessionId,
          phaseId: input.phaseId,
          artifactKey,
          artifactId,
          artifactVersion,
          expectedVersion: result.expectedVersion,
          currentVersion: result.currentVersion,
          casAttempt: attempt,
        });
        continue;
      }

      logM9cBind({
        ok: false,
        code: result.code,
        sessionId: input.sessionId,
        phaseId: input.phaseId,
        artifactKey,
        artifactId,
        artifactVersion,
        expectedVersion: result.expectedVersion,
        currentVersion: result.currentVersion,
        sessionVersion: live.sessionVersion,
        casAttempt: attempt,
      });
      return {
        ok: false,
        code: result.code,
        message: result.message,
        currentVersion: result.currentVersion,
        expectedVersion: result.expectedVersion,
      };
    }

    return {
      ok: false,
      code: "SESSION_VERSION_CONFLICT",
      message: `Session version conflict after ${maxRetries} M9C bind retries`,
    };
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      logM9cBind({
        ok: false,
        code: err.artifactCode,
        sessionId: input.sessionId,
        phaseId: input.phaseId,
        artifactKey,
        artifactId,
        artifactVersion,
        message: err.message,
      });
      return {
        ok: false,
        code: err.artifactCode,
        message: err.message,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    logM9cBind({
      ok: false,
      code: "ARTIFACT_REFERENCE_INVALID",
      sessionId: input.sessionId,
      phaseId: input.phaseId,
      artifactKey,
      artifactId,
      artifactVersion,
      message,
    });
    return {
      ok: false,
      code: "ARTIFACT_REFERENCE_INVALID",
      message,
    };
  }
}
