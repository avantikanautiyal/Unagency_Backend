/**
 * Injection explainability — why each experience was selected.
 */

import type { ExperienceId } from "../../experience-intelligence/contracts/identifiers";

export interface InjectedExperienceExplanation {
  readonly experienceId: ExperienceId;
  readonly whySelected: string;
  readonly evidenceSummary: string;
  readonly successRate: number;
  readonly confidence: number;
  readonly applicableScope: string;
  readonly historicalImprovement: number;
  readonly matchDimensions: readonly string[];
}

export interface InjectionExplainability {
  readonly summary: string;
  readonly perExperience: readonly InjectedExperienceExplanation[];
  readonly conflictsResolved: number;
  readonly deduplicated: number;
  readonly compressedFrom: number;
  readonly compressedTo: number;
}
