/**
 * Mistake and success detection.
 */

import type { Experience } from "../contracts/experience";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";

export interface DetectionResult {
  readonly mistakes: readonly Experience[];
  readonly successes: readonly Experience[];
  readonly warnings: readonly Experience[];
}

export function detectMistakesAndSuccesses(
  experiences: readonly Experience[],
  inputs: ExperienceIntelligenceInputs
): DetectionResult {
  const mistakes = experiences.filter(
    (e) => e.category === "negative" || e.category === "anti_pattern"
  );
  const successes = experiences.filter(
    (e) => e.category === "positive" || e.category === "best_practice"
  );
  const warnings = experiences.filter((e) => e.category === "warning");

  const failedEvals = (inputs.evaluationReports ?? []).filter((r) => !r.summary.passed).length;
  if (failedEvals > 0 && mistakes.length === 0) {
    warnings.push(...experiences.filter((e) => e.category === "correction"));
  }

  return { mistakes, successes, warnings };
}
