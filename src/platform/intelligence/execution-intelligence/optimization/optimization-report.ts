/**
 * Optimization report builder.
 */

import type { ContextOptimizationPlan } from "../contracts/context-optimization";
import type { KnowledgeOptimizationPlan } from "../contracts/knowledge-optimization";
import type { PromptOptimizationPlan } from "../contracts/prompt-optimization";
import type { ExecutionOptimizationReport } from "../contracts/optimization";

export function buildOptimizationReport(
  contextPlan: ContextOptimizationPlan,
  knowledgePlan: KnowledgeOptimizationPlan,
  promptPlan: PromptOptimizationPlan
): ExecutionOptimizationReport {
  const contextGain =
    contextPlan.originalSize > 0
      ? (contextPlan.originalSize - contextPlan.optimizedSize) / contextPlan.originalSize
      : 0;
  const knowledgeGain =
    knowledgePlan.originalChunks > 0
      ? knowledgePlan.redundancyRemoved / knowledgePlan.originalChunks
      : 0;

  const optimizations = [
    {
      dimension: "context_size" as const,
      beforeScore: contextPlan.originalSize,
      afterScore: contextPlan.optimizedSize,
      actions: contextPlan.actions,
    },
    {
      dimension: "knowledge_compression" as const,
      beforeScore: knowledgePlan.originalChunks,
      afterScore: knowledgePlan.selectedChunks,
      actions: knowledgePlan.actions,
    },
    {
      dimension: "prompt_structure" as const,
      beforeScore: 0.7,
      afterScore: 0.7 + promptPlan.estimatedQualityGain,
      actions: promptPlan.actions,
    },
  ];

  const recommendations = [
    {
      id: "rec_context",
      priority: 1,
      title: "Optimize context ordering",
      description: "Reorder context sections by relevance",
      dimension: "context_ordering" as const,
      impact: contextGain,
      selected: contextPlan.orderingApplied,
    },
    {
      id: "rec_knowledge",
      priority: 2,
      title: "Compress knowledge",
      description: "Remove redundant knowledge chunks",
      dimension: "knowledge_compression" as const,
      impact: knowledgeGain,
      selected: knowledgePlan.compressionApplied,
    },
    {
      id: "rec_prompt",
      priority: 3,
      title: "Strengthen prompt structure",
      description: "Apply prompt optimization actions",
      dimension: "prompt_structure" as const,
      impact: promptPlan.estimatedQualityGain,
      selected: promptPlan.structureOptimized,
    },
  ];

  const overallImprovement =
    (contextGain + knowledgeGain + promptPlan.estimatedQualityGain) / 3;

  return {
    optimizations,
    recommendations,
    overallImprovement,
    summary: `Applied ${optimizations.length} optimization dimensions with ${(overallImprovement * 100).toFixed(1)}% estimated improvement`,
  };
}
