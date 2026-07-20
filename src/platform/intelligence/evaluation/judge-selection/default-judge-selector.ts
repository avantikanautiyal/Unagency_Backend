/**
 * Dynamic judge selection from strategy + registry.
 */

import { success, type Result } from "../../shared/result";
import type { JudgeKind } from "../contracts/evaluation-models";
import type {
  DynamicEvaluationStrategy,
  JudgeExecutionPlan,
  JudgeSelectionEntry,
} from "../contracts/dynamic-evaluation";
import type { IJudgeRegistry, IJudgeSelector } from "../interfaces/dynamic-evaluation-ports";
import { PIPELINE_JUDGE_SEEDS } from "../strategy/pipeline-seeds";

export class DefaultJudgeSelector implements IJudgeSelector {
  select(
    strategy: DynamicEvaluationStrategy,
    registry: IJudgeRegistry
  ): Result<JudgeExecutionPlan> {
    const seeds = PIPELINE_JUDGE_SEEDS[strategy.pipelineFamily] ?? PIPELINE_JUDGE_SEEDS.general;
    const listed = registry.list();
    if (!listed.ok) return listed;

    const available = new Set(listed.value.map((d) => d.kind));
    const selected: JudgeSelectionEntry[] = [];
    let priority = 1;

    for (const kind of seeds) {
      if (!available.has(kind as JudgeKind)) continue;
      const desc = registry.getDescriptor(kind as JudgeKind);
      if (!desc.ok || !desc.value) continue;
      selected.push({
        kind: kind as JudgeKind,
        pluginId: desc.value.pluginId,
        reason: `Selected for ${strategy.pipelineFamily} pipeline (${strategy.objective}).`,
        priority: priority++,
      });
    }

    // Always ensure safety for non-low risk
    if (strategy.riskLevel !== "low" && !selected.some((s) => s.kind === "safety")) {
      selected.push({
        kind: "safety",
        pluginId: "plugin_safety",
        reason: "Elevated risk requires Safety Judge.",
        priority: priority++,
      });
    }

    if (strategy.humanApprovalRequired && !selected.some((s) => s.kind === "human")) {
      selected.push({
        kind: "human",
        pluginId: "plugin_human",
        reason: "Human approval required by strategy.",
        priority: priority++,
      });
    }

    return success({
      planId: `jplan_${strategy.pipelineFamily}`,
      selectedJudges: selected,
      humanReviewRequired: strategy.humanApprovalRequired,
      rationale: `Built ${selected.length}-judge plan for ${strategy.pipelineFamily}.`,
    });
  }
}
