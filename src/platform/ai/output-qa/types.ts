/**
 * Phase 16 — Canonical Output QA contracts (post-execution, deterministic).
 * Does not repair, call providers, compose prompts, or mutate CMR/artifacts.
 */

import type { ActionDefinition } from "../action-registry";
import type { ActionExecutionResult } from "../action-execution";

export const OUTPUT_QA_CONTRACT_VERSION = "16.0.0" as const;

export type OutputQAStatus = "VALID" | "INVALID" | "UNSUPPORTED";

export type OutputQASeverity = "error" | "warning";

export type OutputQAErrorCode =
  | "OUTPUT_MISSING"
  | "OUTPUT_KIND_MISMATCH"
  | "OUTPUT_SCHEMA_INVALID"
  | "REQUIRED_FIELD_MISSING"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_INVALID"
  | "ARTIFACT_IDENTITY_MISMATCH"
  | "SERVICE_MISMATCH"
  | "PHASE_MISMATCH"
  | "OUTPUT_CONTRACT_MISMATCH"
  | "PERSISTENCE_MISMATCH"
  | "REQUIRED_UPSTREAM_MISSING"
  | "UNSUPPORTED_VALIDATION"
  | "STRUCTURED_OUTPUT_LOSS"
  | "FREE_TEXT_FALLBACK"
  | "EXECUTION_FAILED";

export type OutputQADiagnostic = {
  readonly code: OutputQAErrorCode;
  readonly severity: OutputQASeverity;
  readonly message: string;
  readonly fieldPath?: string;
  readonly authoritativeSource: string;
};

export type OutputQACheckId =
  | "execution_ok"
  | "output_kind"
  | "output_contract"
  | "action_identity"
  | "action_version"
  | "service_identity"
  | "phase_identity"
  | "artifact_identity"
  | "artifact_version"
  | "artifact_schema"
  | "upstream_presence"
  | "persistence_consistency"
  | "transition_shape"
  | "selection_shape"
  | "approval_shape"
  | "render_shape"
  | "generation_envelope"
  | "class_d_limitation"
  | "approval_note_non_authoritative";

/** Already-loaded artifact payload supplied by caller (no independent lookup). */
export type OutputQAProvidedArtifact = {
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey?: string;
  readonly artifactType?: string;
  readonly schemaVersion?: string;
  readonly serviceId?: string;
  readonly phaseId?: string;
  readonly data?: Record<string, unknown>;
  /** When true, data came from ArtifactVersion — not approval.note. */
  readonly fromArtifactVersion?: boolean;
};

export type OutputQAContext = {
  readonly expectedServiceId?: string;
  readonly expectedPhaseId?: string;
  readonly expectedArtifactId?: string;
  readonly expectedArtifactVersion?: number;
  readonly expectedArtifactKey?: string;
  readonly upstreamRequired?: boolean;
  readonly upstreamPresent?: boolean;
  /** Caller-supplied already-loaded artifact (Phase 8 / execution result). */
  readonly providedArtifact?: OutputQAProvidedArtifact;
  /**
   * When true, structured generation expected; free-text-only payloads are INVALID.
   */
  readonly requireStructuredArtifact?: boolean;
  /**
   * Explicit policy: UNSUPPORTED may continue only when existing contract permits.
   * Default false — UNSUPPORTED does not silently become VALID.
   */
  readonly allowUnvalidatedContinuation?: boolean;
};

export type OutputQAPolicy = {
  /** When true, generation_result without artifact payload → deeper checks / UNSUPPORTED. */
  readonly requireArtifactPersistence?: boolean;
};

export type CanonicalOutputQAInput = {
  readonly action: ActionDefinition;
  readonly executionResult: ActionExecutionResult;
  readonly context?: OutputQAContext;
  readonly policy?: OutputQAPolicy;
};

export type CanonicalOutputQAResult = {
  readonly status: OutputQAStatus;
  readonly actionId: string;
  readonly actionVersion: string;
  readonly outputKind: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly validatedResult?: unknown;
  readonly diagnostics: readonly OutputQADiagnostic[];
  readonly checksPerformed: readonly OutputQACheckId[];
  /**
   * Whether required completion / state advancement may proceed.
   * INVALID → false; VALID → true; UNSUPPORTED → only if allowUnvalidatedContinuation.
   */
  readonly mayAdvance: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export function mayAdvanceFromOutputQA(
  result: CanonicalOutputQAResult,
): boolean {
  return result.mayAdvance;
}
