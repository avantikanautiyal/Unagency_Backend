/**
 * Package experiences into ExecutionExperiencePackage.
 * Structured intelligence only — never prompt content.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import { asExecutionExperiencePackageId } from "../contracts/identifiers";
import type { ExperienceInjectionRequest } from "../contracts/request";
import type {
  ExecutionExperiencePackage,
  PackagedExperience,
} from "../contracts/package";
import type { RelevanceScore } from "../contracts/scoring";
import type { ConflictResolutionResult } from "../contracts/conflict";
import type { PackagedExperienceKind } from "../contracts/enums";
import type { IExperiencePackager } from "../interfaces/experience-injection";
import { EXPERIENCE_INJECTION_VERSION } from "../constants";

function kindOf(e: Experience): PackagedExperienceKind {
  switch (e.category) {
    case "correction":
      return "correction";
    case "best_practice":
    case "positive":
      return "best_practice";
    case "warning":
      return "warning";
    case "anti_pattern":
    case "negative":
      return "anti_pattern";
    case "optimization":
      return "optimization";
    default:
      return "relevant";
  }
}

export class DefaultExperiencePackager implements IExperiencePackager {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  package(
    request: ExperienceInjectionRequest,
    experiences: readonly Experience[],
    scores: readonly RelevanceScore[],
    conflictResult: ConflictResolutionResult,
    totalCandidates: number
  ): Result<ExecutionExperiencePackage> {
    const scoreMap = new Map(scores.map((s) => [String(s.experienceId), s]));

    const packaged: PackagedExperience[] = experiences.map((e, i) => {
      const relevance = scoreMap.get(String(e.experienceId)) ?? {
        experienceId: e.experienceId,
        exactMatchScore: 0,
        applicabilityScore: e.scores.applicabilityScore,
        confidenceScore: e.confidence,
        successScore: 0.5,
        recencyScore: 0.5,
        frequencyScore: 0,
        improvementScore: e.averageImprovement,
        evidenceScore: e.scores.evidenceScore,
        semanticScore: 0,
        overallScore: e.confidence,
        matchKind: "partial" as const,
      };
      return Object.freeze({
        experience: e,
        kind: kindOf(e),
        relevance,
        rank: i + 1,
      });
    });

    const byKind = (k: PackagedExperienceKind) => packaged.filter((p) => p.kind === k);

    const avgConfidence =
      packaged.length === 0
        ? 0
        : packaged.reduce((s, p) => s + p.experience.confidence, 0) / packaged.length;

    const evidenceReferences = [
      ...new Set(packaged.flatMap((p) => p.experience.evidence)),
    ];

    const perExperience = packaged.map((p) => {
      const e = p.experience;
      const total = e.successCount + e.failureCount;
      const successRate = total === 0 ? 0 : e.successCount / total;
      const matchDimensions = [
        e.capabilityId && "capability",
        e.department && "department",
        e.taskType && "taskType",
        e.workflowId && "workflow",
        e.providerId && "provider",
        e.modelId && "model",
      ].filter(Boolean) as string[];

      return Object.freeze({
        experienceId: e.experienceId,
        whySelected: `Rank ${p.rank}: overall relevance ${p.relevance.overallScore.toFixed(3)} (${p.relevance.matchKind})`,
        evidenceSummary: e.evidence.join("; ") || e.explanation.evidenceSummary,
        successRate,
        confidence: e.confidence,
        applicableScope: e.explanation.whenApplies,
        historicalImprovement: e.averageImprovement,
        matchDimensions,
      });
    });

    return success(
      Object.freeze({
        packageId: asExecutionExperiencePackageId(this.createId("eep")),
        requestId: request.requestId,
        relevantExperiences: packaged,
        corrections: packaged.map((p) => p.experience.correctionStrategy),
        bestPractices: byKind("best_practice"),
        warnings: byKind("warning"),
        antiPatterns: byKind("anti_pattern"),
        optimizationSuggestions: byKind("optimization"),
        applicability: packaged.map((p) => p.experience.applicableConditions),
        confidence: avgConfidence,
        evidenceReferences,
        conflicts: conflictResult.conflicts,
        explainability: Object.freeze({
          summary: `Injected ${packaged.length} of ${totalCandidates} candidate experiences`,
          perExperience,
          conflictsResolved: conflictResult.conflicts.length,
          deduplicated: Math.max(0, totalCandidates - packaged.length),
          compressedFrom: totalCandidates,
          compressedTo: packaged.length,
        }),
        topN: request.topN ?? packaged.length,
        totalCandidates,
        advisoryOnly: true as const,
        containsPromptContent: false as const,
        version: EXPERIENCE_INJECTION_VERSION,
        createdAt: this.nowIso(),
      })
    );
  }
}
