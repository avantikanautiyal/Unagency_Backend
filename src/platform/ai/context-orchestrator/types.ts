/**
 * Phase 10 — Context Orchestrator contract (provider-neutral).
 * Coordinates existing Phase 2–9A contributors; does not invent context.
 */

import type { CanonicalModelRequest } from "../canonical-model-request";
import type {
  ApplyCanonicalGenerationContextInput,
  CanonicalGenerationRequest,
  GenerationContextErrorCode,
} from "../../cdf/generation-context/types";

/** Generation intent + carrier metadata accepted by the orchestrator. */
export type ContextOrchestrationInput = ApplyCanonicalGenerationContextInput;

export type ContextContributorPresence = {
  readonly requirements: boolean;
  readonly decisions: boolean;
  readonly references: boolean;
  readonly workingMemory: boolean;
  readonly multimodal: boolean;
  readonly upstreamArtifacts: boolean;
  readonly activeBrief: boolean;
  readonly cdfPhase: boolean;
  readonly productionSpec: boolean;
  readonly outputContract: boolean;
  readonly outputRequirements: boolean;
};

export const CONTEXT_ORCHESTRATOR_SOURCE = "context_orchestrator" as const;

export type ContextOrchestrationSkip = {
  readonly ok: true;
  readonly skipped: true;
  readonly orchestratorApplied: false;
  readonly prompt: string;
  readonly metadata: Record<string, unknown>;
};

export type ContextOrchestrationApplied = {
  readonly ok: true;
  readonly skipped: false;
  readonly orchestratorApplied: true;
  readonly assemblySource: typeof CONTEXT_ORCHESTRATOR_SOURCE;
  readonly request: CanonicalGenerationRequest;
  readonly modelRequest: CanonicalModelRequest;
  readonly prompt: string;
  readonly metadata: Record<string, unknown>;
  readonly contributors: ContextContributorPresence;
};

export type ContextOrchestrationFailure = {
  readonly ok: false;
  readonly orchestratorApplied: false;
  readonly code: GenerationContextErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
};

export type ContextOrchestrationResult =
  | ContextOrchestrationSkip
  | ContextOrchestrationApplied
  | ContextOrchestrationFailure;
