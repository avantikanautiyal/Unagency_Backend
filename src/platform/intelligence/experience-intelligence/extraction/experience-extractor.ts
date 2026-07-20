/**
 * Experience extractor — transforms historical inputs into raw experiences.
 */

import { success, type Result } from "../../shared/result";
import { asExperienceId } from "../contracts/identifiers";
import type { Experience } from "../contracts/experience";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { IExperienceExtractor } from "../interfaces/experience-intelligence";
import { DefaultExperienceBuilder } from "../experience-builder/default-experience-builder";

export class DefaultExperienceExtractor implements IExperienceExtractor {
  constructor(
    private readonly builder: DefaultExperienceBuilder,
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`
  ) {}

  extract(inputs: ExperienceIntelligenceInputs): Result<readonly Experience[]> {
    const experiences: Experience[] = [];

    for (const report of inputs.evaluationReports ?? []) {
      const passed = report.summary.passed;
      experiences.push(
        this.builder.buildFromEvaluation(report, passed ? "positive" : "negative", this.createId)
      );
    }

    for (const result of inputs.optimizationResults ?? []) {
      for (const rec of result.recommendations) {
        experiences.push(this.builder.buildFromOptimization(rec, this.createId));
      }
    }

    for (const learning of inputs.learningResults ?? []) {
      for (const insight of learning.insights) {
        experiences.push(
          this.builder.buildFromLearning(insight, learning, this.createId)
        );
      }
    }

    for (const obs of inputs.observabilityReports ?? []) {
      if (obs.successRate < 0.8 || obs.qualityScore < 0.7) {
        experiences.push(this.builder.buildFromObservability(obs, this.createId));
      } else if (obs.successRate >= 0.95) {
        experiences.push(this.builder.buildFromObservabilitySuccess(obs, this.createId));
      }
    }

    for (const record of inputs.modelDecisionRecords ?? []) {
      experiences.push(this.builder.buildFromModelDecision(record, this.createId));
    }

    for (const human of inputs.humanArtifacts ?? []) {
      experiences.push(this.builder.buildFromHumanFeedback(human, this.createId));
    }

    return success(experiences);
  }
}
