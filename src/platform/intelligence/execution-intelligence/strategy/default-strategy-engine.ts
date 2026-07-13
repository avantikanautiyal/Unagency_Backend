/**
 * Execution strategy catalog and selection engine.
 */

import { success, type Result } from "../../shared/result";
import type {
  ExecutionMode,
  ExecutionStrategy,
  ExecutionHeuristic,
} from "../contracts/strategy";
import type {
  ExecutionModeKind,
  ExecutionStrategyKind,
} from "../contracts/enums";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IExecutionStrategyEngine } from "../interfaces/execution-intelligence";

const STRATEGIES: Record<ExecutionStrategyKind, ExecutionStrategy> = {
  single_pass: {
    kind: "single_pass",
    label: "Single Pass",
    description: "One generation pass with minimal overhead",
    passes: 1,
    requiresReasoning: false,
    requiresVerification: false,
    supportsParallelism: false,
  },
  multi_pass: {
    kind: "multi_pass",
    label: "Multi Pass",
    description: "Multiple refinement passes",
    passes: 2,
    requiresReasoning: false,
    requiresVerification: true,
    supportsParallelism: false,
  },
  reasoning_first: {
    kind: "reasoning_first",
    label: "Reasoning First",
    description: "Reason before generating output",
    passes: 2,
    requiresReasoning: true,
    requiresVerification: false,
    supportsParallelism: false,
  },
  research_first: {
    kind: "research_first",
    label: "Research First",
    description: "Gather and rank knowledge before generation",
    passes: 2,
    requiresReasoning: false,
    requiresVerification: false,
    supportsParallelism: false,
  },
  plan_first: {
    kind: "plan_first",
    label: "Plan First",
    description: "Decompose task into steps before execution",
    passes: 2,
    requiresReasoning: true,
    requiresVerification: false,
    supportsParallelism: false,
  },
  generate_review_improve: {
    kind: "generate_review_improve",
    label: "Generate-Review-Improve",
    description: "Generate, review, then improve output",
    passes: 3,
    requiresReasoning: false,
    requiresVerification: true,
    supportsParallelism: false,
  },
  tree_of_thought: {
    kind: "tree_of_thought",
    label: "Tree of Thought",
    description: "Placeholder for branching reasoning exploration",
    passes: 3,
    requiresReasoning: true,
    requiresVerification: true,
    supportsParallelism: true,
    placeholder: true,
  },
  reflection: {
    kind: "reflection",
    label: "Reflection",
    description: "Self-reflect on draft output",
    passes: 2,
    requiresReasoning: true,
    requiresVerification: true,
    supportsParallelism: false,
  },
  self_verification: {
    kind: "self_verification",
    label: "Self Verification",
    description: "Verify output against constraints",
    passes: 2,
    requiresReasoning: false,
    requiresVerification: true,
    supportsParallelism: false,
  },
  parallel_generation: {
    kind: "parallel_generation",
    label: "Parallel Generation",
    description: "Generate multiple candidates in parallel",
    passes: 1,
    requiresReasoning: false,
    requiresVerification: false,
    supportsParallelism: true,
  },
  consensus_generation: {
    kind: "consensus_generation",
    label: "Consensus Generation",
    description: "Merge parallel candidates into consensus",
    passes: 2,
    requiresReasoning: false,
    requiresVerification: true,
    supportsParallelism: true,
  },
};

const MODES: Record<ExecutionModeKind, ExecutionMode> = {
  fast: {
    kind: "fast",
    label: "Fast",
    description: "Minimize latency",
    qualityBias: 0.3,
    latencyBias: 0.9,
    costBias: 0.7,
  },
  balanced: {
    kind: "balanced",
    label: "Balanced",
    description: "Balance quality, latency, and cost",
    qualityBias: 0.6,
    latencyBias: 0.6,
    costBias: 0.6,
  },
  quality: {
    kind: "quality",
    label: "Quality",
    description: "Maximize output quality",
    qualityBias: 0.95,
    latencyBias: 0.3,
    costBias: 0.4,
  },
  research: {
    kind: "research",
    label: "Research",
    description: "Prioritize knowledge gathering",
    qualityBias: 0.8,
    latencyBias: 0.4,
    costBias: 0.5,
  },
  reasoning: {
    kind: "reasoning",
    label: "Reasoning",
    description: "Prioritize reasoning depth",
    qualityBias: 0.85,
    latencyBias: 0.35,
    costBias: 0.45,
  },
  conservative: {
    kind: "conservative",
    label: "Conservative",
    description: "Minimize risk with verification",
    qualityBias: 0.75,
    latencyBias: 0.25,
    costBias: 0.35,
  },
};

function weightedScore(heuristics: readonly ExecutionHeuristic[]): number {
  const totalWeight = heuristics.reduce((s, h) => s + h.weight, 0) || 1;
  return heuristics.reduce((s, h) => s + h.score * h.weight, 0) / totalWeight;
}

export class DefaultExecutionStrategyEngine implements IExecutionStrategyEngine {
  selectStrategy(
    request: ExecutionIntelligenceRequest,
    heuristics: readonly ExecutionHeuristic[]
  ): Result<ExecutionStrategy> {
    if (request.preferences?.preferredStrategy) {
      return success(STRATEGIES[request.preferences.preferredStrategy]);
    }

    const score = weightedScore(heuristics);
    const knowledgeHeavy =
      heuristics.find((h) => h.kind === "knowledge_density")?.score ?? 0;
    const complex = heuristics.find((h) => h.kind === "complexity")?.score ?? 0;
    const ambiguous = heuristics.find((h) => h.kind === "ambiguity")?.score ?? 0;

    let kind: ExecutionStrategyKind = "single_pass";
    if (request.preferences?.enableVerification || ambiguous > 0.5) {
      kind = "self_verification";
    } else if (request.preferences?.enableReasoning || complex > 0.6) {
      kind = "reasoning_first";
    } else if (knowledgeHeavy > 0.5) {
      kind = "research_first";
    } else if (score > 0.55) {
      kind = "generate_review_improve";
    } else if (score > 0.35) {
      kind = "multi_pass";
    }

    return success(STRATEGIES[kind]);
  }

  selectMode(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionMode> {
    if (request.preferences?.preferredMode) {
      return success(MODES[request.preferences.preferredMode]);
    }
    if (request.preferences?.prioritizeQuality) {
      return success(MODES.quality);
    }
    if (request.preferences?.prioritizeCost) {
      return success(MODES.fast);
    }
    if (strategy.requiresReasoning) {
      return success(MODES.reasoning);
    }
    if (strategy.requiresVerification) {
      return success(MODES.conservative);
    }
    return success(MODES.balanced);
  }
}

export function strategyFor(kind: ExecutionStrategyKind): ExecutionStrategy {
  return STRATEGIES[kind];
}

export function modeFor(kind: ExecutionModeKind): ExecutionMode {
  return MODES[kind];
}

export const ALL_STRATEGIES = Object.values(STRATEGIES);
