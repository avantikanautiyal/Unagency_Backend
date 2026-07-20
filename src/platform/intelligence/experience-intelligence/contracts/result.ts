/**
 * Experience Intelligence report — primary output.
 */

import type { ExperienceReportId } from "./identifiers";
import type { Experience } from "./experience";
import type { ExperienceSnapshot } from "./snapshot";
import type { RootCause } from "./root-cause";
import type { CorrectionStrategy } from "./correction";
import type { ApplicabilityConditions } from "./applicability";
import type { ExperienceExplanation } from "./explainability";

export interface ExperienceIntelligenceStatistics {
  readonly executionsProcessed: number;
  readonly experiencesExtracted: number;
  readonly positiveExperiences: number;
  readonly negativeExperiences: number;
  readonly rootCausesIdentified: number;
  readonly correctionsGenerated: number;
  readonly totalDurationMs: number;
}

export interface ExperienceIntelligenceReport {
  readonly reportId: ExperienceReportId;
  readonly requestId: string;
  readonly experiences: readonly Experience[];
  readonly rootCauses: readonly RootCause[];
  readonly correctionStrategies: readonly CorrectionStrategy[];
  readonly applicabilityMaps: readonly ApplicabilityConditions[];
  readonly snapshot: ExperienceSnapshot;
  readonly explanation: ExperienceExplanation;
  readonly statistics: ExperienceIntelligenceStatistics;
  readonly createdAt: string;
}
