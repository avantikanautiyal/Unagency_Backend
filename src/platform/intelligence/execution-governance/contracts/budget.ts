/**
 * Budget assessment contracts.
 */

export interface StageBudgetEstimate {
  readonly stageName: string;
  readonly estimatedModelCost: number;
  readonly estimatedProviderCost: number;
  readonly estimatedTokens: number;
}

export interface AgentBudgetEstimate {
  readonly agentRole: string;
  readonly estimatedCost: number;
  readonly estimatedTokens: number;
}

export interface BudgetAssessment {
  readonly assessmentId: string;
  readonly expectedModelCost: number;
  readonly expectedProviderCost: number;
  readonly totalExecutionBudget: number;
  readonly perStageBudget: readonly StageBudgetEstimate[];
  readonly perAgentBudget: readonly AgentBudgetEstimate[];
  readonly fallbackBudget: number;
  readonly safetyMargin: number;
  readonly withinBudget: boolean;
  readonly recommendations: readonly string[];
  readonly rationale: string;
}
