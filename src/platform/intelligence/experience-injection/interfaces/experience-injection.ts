/**
 * Experience Injection interfaces.
 */

import type { Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { IExperienceRepository } from "../../experience-intelligence/interfaces/experience-intelligence";
import type { ExperienceInjectionRequest, ExperienceInjectionContext } from "../contracts/request";
import type { ExperienceInjectionReport } from "../contracts/result";
import type { ExecutionExperiencePackage } from "../contracts/package";
import type { RelevanceScore, PrioritizationScore } from "../contracts/scoring";
import type { ConflictResolutionResult } from "../contracts/conflict";
import type { ConflictResolutionStrategy } from "../contracts/enums";

export interface IExperienceInjectionEngine {
  inject(request: ExperienceInjectionRequest): Promise<Result<ExperienceInjectionReport>>;
}

export interface IContextExtractor {
  extract(request: ExperienceInjectionRequest): ExperienceInjectionContext;
}

export interface IExperienceRetriever {
  retrieve(
    repository: IExperienceRepository,
    context: ExperienceInjectionContext
  ): Result<readonly Experience[]>;
}

export interface IApplicabilityMatcher {
  match(
    experiences: readonly Experience[],
    context: ExperienceInjectionContext
  ): Result<readonly Experience[]>;
}

export interface ISimilarityEngine {
  score(
    experiences: readonly Experience[],
    context: ExperienceInjectionContext
  ): Result<readonly RelevanceScore[]>;
}

/** Placeholder semantic similarity — never calls AI. */
export interface ISemanticSimilarityEngine {
  score(a: string, b: string): number;
}

export interface IConflictResolver {
  resolve(
    experiences: readonly Experience[],
    strategy: ConflictResolutionStrategy
  ): Result<ConflictResolutionResult>;
}

export interface IDeduplicator {
  deduplicate(experiences: readonly Experience[]): Result<readonly Experience[]>;
}

export interface IPrioritizer {
  prioritize(
    experiences: readonly Experience[],
    scores: readonly RelevanceScore[]
  ): Result<readonly PrioritizationScore[]>;
}

export interface IExperienceCompressor {
  compress(
    experiences: readonly Experience[],
    scores: readonly RelevanceScore[],
    priorities: readonly PrioritizationScore[],
    topN: number,
    maxItems: number
  ): Result<readonly Experience[]>;
}

export interface IExperiencePackager {
  package(
    request: ExperienceInjectionRequest,
    experiences: readonly Experience[],
    scores: readonly RelevanceScore[],
    conflictResult: ConflictResolutionResult,
    totalCandidates: number
  ): Result<ExecutionExperiencePackage>;
}

export interface IInjectionValidator {
  validate(pkg: ExecutionExperiencePackage): Result<boolean>;
}

/** Future consumers — interfaces only. */
export interface IExecutionIntelligenceInjectionConsumer {
  consume(pkg: ExecutionExperiencePackage): Promise<Result<void>>;
}

export interface IPromptCompilerInjectionConsumer {
  consume(pkg: ExecutionExperiencePackage): Promise<Result<void>>;
}

export interface IModelIntelligenceInjectionConsumer {
  consume(pkg: ExecutionExperiencePackage): Promise<Result<void>>;
}

export interface IAgentPlanningInjectionConsumer {
  consume(pkg: ExecutionExperiencePackage): Promise<Result<void>>;
}

export interface IWorkflowIntelligenceInjectionConsumer {
  consume(pkg: ExecutionExperiencePackage): Promise<Result<void>>;
}
