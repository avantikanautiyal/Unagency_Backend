/**
 * Mutable state threaded through create-execution phases.
 */

import type { AuthPrincipal, CreateExecutionRequest, ExecutionResource } from "../contracts";
import type {
  BrandContext,
  ExecutionPlan,
  KnowledgeContext,
  StructuredBrief,
} from "../../os";
import type { PromptSignals } from "../../business/brand-brain/learning/prompt-signal-learner";

export type CreatePipelineState = {
  req: CreateExecutionRequest;
  principal: AuthPrincipal;
  capabilityIdRaw: string;
  prompt: string;
  trustedOrganizationId: string;
  workingMetadata?: Record<string, unknown>;
  providerPrompt: string;
  requestFingerprint: string;
  executionId: string;
  correlationId: string;
  now: string;
  structuredBrief?: StructuredBrief;
  structuredBrandContext?: BrandContext;
  structuredKnowledgeContext?: KnowledgeContext;
  structuredExecutionPlan?: ExecutionPlan;
  promptLearnedSignals?: PromptSignals;
};

export type PhaseOutcome<T> =
  | { kind: "done"; resource: ExecutionResource }
  | { kind: "continue"; state: T };
