/**
 * Experience Injection report.
 */

import type { ExperienceInjectionResultId } from "./identifiers";
import type { ExperienceInjectionRequest } from "./request";
import type { ExecutionExperiencePackage } from "./package";
import type { RelevanceScore } from "./scoring";
import type { ConflictResolutionResult } from "./conflict";

export interface ExperienceInjectionStatistics {
  readonly candidatesRetrieved: number;
  readonly afterApplicability: number;
  readonly afterDeduplication: number;
  readonly afterConflictResolution: number;
  readonly afterCompression: number;
  readonly totalDurationMs: number;
}

export interface ExperienceInjectionReport {
  readonly resultId: ExperienceInjectionResultId;
  readonly request: ExperienceInjectionRequest;
  readonly package: ExecutionExperiencePackage;
  readonly relevanceScores: readonly RelevanceScore[];
  readonly conflictResult: ConflictResolutionResult;
  readonly statistics: ExperienceInjectionStatistics;
  readonly createdAt: string;
}
