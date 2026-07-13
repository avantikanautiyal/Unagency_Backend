/**
 * Execution Intelligence request contract.
 */

import type { CapabilityId, ProviderId } from "../../shared/identifiers";
import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import type { ExecutionModeKind, ExecutionStrategyKind } from "./enums";

export interface ExecutionIntelligencePreferences {
  readonly preferredStrategy?: ExecutionStrategyKind;
  readonly preferredMode?: ExecutionModeKind;
  readonly maxTokenBudget?: number;
  readonly prioritizeQuality?: boolean;
  readonly prioritizeCost?: boolean;
  readonly enableVerification?: boolean;
  readonly enableReasoning?: boolean;
  readonly targetProviderId?: ProviderId;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ExecutionIntelligenceRequest {
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly context: IntelligenceContext;
  readonly knowledge: KnowledgeSnapshot;
  readonly compiledPrompt: CompiledPrompt;
  readonly preferences?: ExecutionIntelligencePreferences;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
