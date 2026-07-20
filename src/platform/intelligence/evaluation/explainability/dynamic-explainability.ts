/**
 * Explainability for dynamic evaluation.
 */

import { success, type Result } from "../../shared/result";
import type { EvaluationExplainabilityReport } from "../contracts/dynamic-evaluation";
import type { IDynamicEvaluationExplainabilityBuilder } from "../interfaces/dynamic-evaluation-ports";

export class DefaultDynamicExplainabilityBuilder
  implements IDynamicEvaluationExplainabilityBuilder
{
  build(input: Parameters<IDynamicEvaluationExplainabilityBuilder["build"]>[0]): Result<EvaluationExplainabilityReport> {
    return success({
      whyJudgesSelected: input.plan.selectedJudges.map(
        (j) => `${j.kind}: ${j.reason}`
      ),
      whyWeightsChosen: input.weights.entries.map(
        (e) => `${e.kind}=${e.weight.toFixed(3)} (${e.rationale})`
      ),
      benchmarksUsed: [
        `${input.benchmark.profileId} target=${input.benchmark.targetScore}`,
        `historicalSamples=${input.benchmark.historicalSampleSize}`,
      ],
      evidenceRequired: input.evidence.requirements.map(
        (r) => `${r.evidenceId}: ${r.description}${r.required ? " [required]" : ""}`
      ),
      experienceInfluence: [
        `experienceSignals=${input.strategy.experienceSignalCount}`,
        ...(input.request.inputs.humanFeedback ?? []).map((f) => `feedback:${f}`),
      ],
      strategyRationale: input.strategy.rationale,
    });
  }
}
