/**
 * Strongly typed artifact payload contracts.
 * Immutable models only — no business logic.
 */

import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { EvaluationReport } from "../../evaluation/contracts/evaluation-models";
import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { MemorySnapshot } from "../../memory/contracts/memory-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import type { Artifact } from "./artifact-models";

export interface ContextArtifactPayload {
  readonly context: IntelligenceContext;
}

export interface KnowledgeArtifactPayload {
  readonly knowledge: KnowledgeSnapshot;
}

export interface PromptArtifactPayload {
  readonly prompt: CompiledPrompt;
}

export interface ProviderRequestArtifactPayload {
  readonly request: Readonly<Record<string, unknown>>;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface ProviderResponseArtifactPayload {
  readonly response: Readonly<Record<string, unknown>>;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface ExecutionArtifactPayload {
  readonly execution: ExecutionResult;
}

export interface EvaluationArtifactPayload {
  readonly evaluation: EvaluationReport;
}

export interface MemoryArtifactPayload {
  readonly memory: MemorySnapshot;
}

export interface LearningArtifactPayload {
  readonly signal: Readonly<Record<string, unknown>>;
  readonly signalType?: string;
}

export interface WorkflowArtifactPayload {
  readonly workflow: Readonly<Record<string, unknown>>;
  readonly workflowId?: string;
}

export interface DecisionArtifactPayload {
  readonly decision: Readonly<Record<string, unknown>>;
  readonly disposition?: string;
}

export interface HumanArtifactPayload {
  readonly feedback: Readonly<Record<string, unknown>>;
  readonly reviewerId?: string;
}

export interface BrandArtifactPayload {
  readonly brand: Readonly<Record<string, unknown>>;
  readonly brandId?: string;
}

export interface CapabilityArtifactPayload {
  readonly capability: Readonly<Record<string, unknown>>;
  readonly capabilityId?: string;
}

export interface PolicyArtifactPayload {
  readonly policy: Readonly<Record<string, unknown>>;
  readonly policyId?: string;
}

export type ContextArtifact = Artifact<ContextArtifactPayload>;
export type KnowledgeArtifact = Artifact<KnowledgeArtifactPayload>;
export type PromptArtifact = Artifact<PromptArtifactPayload>;
export type ProviderRequestArtifact = Artifact<ProviderRequestArtifactPayload>;
export type ProviderResponseArtifact = Artifact<ProviderResponseArtifactPayload>;
export type ExecutionArtifact = Artifact<ExecutionArtifactPayload>;
export type EvaluationArtifact = Artifact<EvaluationArtifactPayload>;
export type MemoryArtifact = Artifact<MemoryArtifactPayload>;
export type LearningArtifact = Artifact<LearningArtifactPayload>;
export type WorkflowArtifact = Artifact<WorkflowArtifactPayload>;
export type DecisionArtifact = Artifact<DecisionArtifactPayload>;
export type HumanArtifact = Artifact<HumanArtifactPayload>;
export type BrandArtifact = Artifact<BrandArtifactPayload>;
export type CapabilityArtifact = Artifact<CapabilityArtifactPayload>;
export type PolicyArtifact = Artifact<PolicyArtifactPayload>;
