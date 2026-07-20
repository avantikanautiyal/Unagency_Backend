/**
 * Experience Intelligence engine and subsystem interfaces.
 */

import type { Result } from "../../shared/result";
import type { ExperienceIntelligenceRequest } from "../contracts/request";
import type { ExperienceIntelligenceReport } from "../contracts/result";
import type { Experience } from "../contracts/experience";
import type { ExperienceSnapshot } from "../contracts/snapshot";
import type { ExperienceSearchQuery, ExperienceSearchResult } from "../contracts/search";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { RootCause } from "../contracts/root-cause";
import type { CorrectionStrategy } from "../contracts/correction";
import type { ApplicabilityConditions } from "../contracts/applicability";
import type { ExperienceScores } from "../contracts/scoring";

export interface IExperienceIntelligenceEngine {
  process(request: ExperienceIntelligenceRequest): Promise<Result<ExperienceIntelligenceReport>>;
  search(query: ExperienceSearchQuery): Promise<Result<ExperienceSearchResult>>;
  snapshot(): Promise<Result<ExperienceSnapshot>>;
}

export interface IExperienceRepository {
  save(experience: Experience): Result<Experience>;
  saveMany(experiences: readonly Experience[]): Result<readonly Experience[]>;
  findById(id: string): Result<Experience | undefined>;
  findAll(): Result<readonly Experience[]>;
  search(query: ExperienceSearchQuery): Result<ExperienceSearchResult>;
  snapshot(): Result<ExperienceSnapshot>;
  count(): Result<number>;
}

export interface IExperienceExtractor {
  extract(inputs: ExperienceIntelligenceInputs): Result<readonly Experience[]>;
}

export interface IRootCauseAnalyzer {
  analyze(inputs: ExperienceIntelligenceInputs, experiences: readonly Experience[]): Result<readonly RootCause[]>;
}

export interface ICorrectionStrategist {
  generate(
    rootCauses: readonly RootCause[],
    experiences: readonly Experience[]
  ): Result<readonly CorrectionStrategy[]>;
}

export interface IApplicabilityEngine {
  derive(
    inputs: ExperienceIntelligenceInputs,
    experiences: readonly Experience[]
  ): Result<readonly ApplicabilityConditions[]>;
}

export interface IExperienceConfidenceEngine {
  score(
    inputs: ExperienceIntelligenceInputs,
    experience: Experience
  ): Result<ExperienceScores>;
}

export interface IExperienceValidator {
  validate(experience: Experience): Result<boolean>;
}

export interface IExperienceSearchEngine {
  search(repository: IExperienceRepository, query: ExperienceSearchQuery): Result<ExperienceSearchResult>;
}

/** Future integration interfaces — not implemented. */
export interface IExperienceConsumer {
  readonly moduleName: string;
  consume(experiences: readonly Experience[]): Promise<Result<void>>;
}

export interface IExecutionIntelligenceExperienceBridge {
  queryApplicable(capabilityId: string): Promise<Result<readonly Experience[]>>;
}

export interface IPromptCompilerExperienceBridge {
  queryPromptExperiences(templateId: string): Promise<Result<readonly Experience[]>>;
}

export interface IModelIntelligenceExperienceBridge {
  queryModelExperiences(modelId: string): Promise<Result<readonly Experience[]>>;
}
