/**
 * ExecutionExperiencePackage — structured intelligence only.
 * NEVER contains raw prompts or prompt fragments.
 */

import type { ExecutionExperiencePackageId } from "./identifiers";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { CorrectionStrategy } from "../../experience-intelligence/contracts/correction";
import type { ApplicabilityConditions } from "../../experience-intelligence/contracts/applicability";
import type { InjectionExplainability } from "./explainability";
import type { RelevanceScore } from "./scoring";
import type { ExperienceConflict } from "./conflict";
import type { PackagedExperienceKind } from "./enums";

export interface PackagedExperience {
  readonly experience: Experience;
  readonly kind: PackagedExperienceKind;
  readonly relevance: RelevanceScore;
  readonly rank: number;
}

export interface ExecutionExperiencePackage {
  readonly packageId: ExecutionExperiencePackageId;
  readonly requestId: string;
  readonly relevantExperiences: readonly PackagedExperience[];
  readonly corrections: readonly CorrectionStrategy[];
  readonly bestPractices: readonly PackagedExperience[];
  readonly warnings: readonly PackagedExperience[];
  readonly antiPatterns: readonly PackagedExperience[];
  readonly optimizationSuggestions: readonly PackagedExperience[];
  readonly applicability: readonly ApplicabilityConditions[];
  readonly confidence: number;
  readonly evidenceReferences: readonly string[];
  readonly conflicts: readonly ExperienceConflict[];
  readonly explainability: InjectionExplainability;
  readonly topN: number;
  readonly totalCandidates: number;
  readonly advisoryOnly: true;
  readonly containsPromptContent: false;
  readonly version: string;
  readonly createdAt: string;
}
