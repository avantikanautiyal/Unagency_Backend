/**
 * Experience Injection testing utilities.
 */

import { asCapabilityId } from "../../shared/identifiers";
import { asExperienceId } from "../../experience-intelligence/contracts/identifiers";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import { InMemoryExperienceRepository } from "../../experience-intelligence/experience-repository/in-memory-experience-repository";
import {
  setupExperienceIntelligencePlatform,
  sampleExperienceIntelligenceRequest,
} from "../../experience-intelligence/testing";
import { ExperienceInjectionRequestBuilder } from "../builders/experience-injection-request-builder";
import {
  createExperienceInjectionPlatform,
  type ExperienceInjectionPlatform,
  type CreateExperienceInjectionOptions,
} from "../factories/create-experience-injection-platform";
import { EXPERIENCE_INTELLIGENCE_VERSION } from "../../experience-intelligence/constants";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

function baseExperience(
  id: string,
  overrides: Partial<Experience> & {
    category: Experience["category"];
    recommendation: string;
    correctionKind?: Experience["correctionStrategy"]["kind"];
    correctionInstruction?: string;
  }
): Experience {
  return Object.freeze({
    experienceId: asExperienceId(id),
    category: overrides.category,
    type: overrides.category,
    trigger: overrides.trigger ?? overrides.recommendation,
    context: {},
    rootCause: {
      causeId: `rc_${id}`,
      kind: overrides.rootCause?.kind ?? "unknown",
      description: overrides.rootCause?.description ?? overrides.recommendation,
      evidence: overrides.evidence ?? [`ev_${id}`],
      confidence: overrides.confidence ?? 0.8,
    },
    observedBehaviour: overrides.observedBehaviour ?? "observed",
    correctionStrategy: {
      strategyId: `corr_${id}`,
      kind: overrides.correctionKind ?? "custom",
      instruction: overrides.correctionInstruction ?? overrides.recommendation,
      rationale: overrides.recommendation,
      priority: "medium",
      advisoryOnly: true as const,
    },
    recommendation: overrides.recommendation,
    confidence: overrides.confidence ?? 0.8,
    evidence: overrides.evidence ?? [`ev_${id}`],
    supportingArtifactIds: [],
    applicableConditions: overrides.applicableConditions ?? {
      capabilityId: asCapabilityId("text.generate"),
      department: "marketing",
    },
    capabilityId: overrides.capabilityId ?? "text.generate",
    department: overrides.department ?? "marketing",
    industry: overrides.industry,
    taskType: overrides.taskType ?? "product_launch",
    workflowId: overrides.workflowId,
    executionStrategy: overrides.executionStrategy,
    promptTemplateId: overrides.promptTemplateId,
    modelId: overrides.modelId,
    providerId: overrides.providerId,
    language: overrides.language ?? "en",
    region: overrides.region,
    organizationId: overrides.organizationId,
    workspaceId: overrides.workspaceId,
    usageCount: overrides.usageCount ?? 10,
    successCount: overrides.successCount ?? 8,
    failureCount: overrides.failureCount ?? 2,
    averageImprovement: overrides.averageImprovement ?? 0.15,
    scores: overrides.scores ?? {
      confidence: overrides.confidence ?? 0.8,
      evidenceScore: 0.7,
      impactScore: 0.6,
      reuseScore: 0.4,
      improvementScore: 0.15,
      applicabilityScore: 0.85,
    },
    explanation: overrides.explanation ?? {
      whyExists: overrides.recommendation,
      evidenceSummary: `Evidence for ${id}`,
      whenApplies: "marketing product launch",
      whenNotApplies: "legal reviews",
      historicalImprovement: "15% improvement",
    },
    lifecycle: overrides.lifecycle ?? "validated",
    version: EXPERIENCE_INTELLIGENCE_VERSION,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  });
}

export function makeSeedExperiences(count = 100): Experience[] {
  const experiences: Experience[] = [];

  // Conflicting tone experiences
  experiences.push(
    baseExperience("playful", {
      category: "best_practice",
      recommendation: "Use playful tone for sneaker launches",
      correctionKind: "adjust_tone",
      correctionInstruction: "Use playful tone",
      confidence: 0.75,
    }),
    baseExperience("formal", {
      category: "best_practice",
      recommendation: "Use formal tone for brand communications",
      correctionKind: "adjust_tone",
      correctionInstruction: "Use formal tone",
      confidence: 0.9,
    })
  );

  experiences.push(
    baseExperience("cta", {
      category: "correction",
      recommendation: "Always include CTA",
      correctionKind: "include_cta",
      correctionInstruction: "Always include CTA",
      confidence: 0.95,
      successCount: 50,
      failureCount: 2,
    }),
    baseExperience("anti_hashtag", {
      category: "anti_pattern",
      recommendation: "Never generate hashtags for luxury brands",
      correctionKind: "avoid_hashtags_luxury",
      confidence: 0.88,
    }),
    baseExperience("warn_brand", {
      category: "warning",
      recommendation: "Watch for brand mismatch in copy",
      confidence: 0.7,
    }),
    baseExperience("opt_model", {
      category: "optimization",
      recommendation: "Prefer high-quality model for creative copy",
      correctionKind: "switch_model",
      confidence: 0.82,
    })
  );

  const remaining = Math.max(0, count - experiences.length);
  for (let i = 0; i < remaining; i++) {
    const category =
      i % 5 === 0
        ? "negative"
        : i % 4 === 0
          ? "positive"
          : i % 3 === 0
            ? "correction"
            : "best_practice";
    experiences.push(
      baseExperience(`gen_${i}`, {
        category: category as Experience["category"],
        recommendation: `Experience recommendation ${i} for product launch`,
        confidence: 0.5 + (i % 50) / 100,
        capabilityId: i % 10 === 0 ? "image.generate" : "text.generate",
        department: i % 7 === 0 ? "legal" : "marketing",
        usageCount: i,
        successCount: Math.floor(i * 0.8),
        failureCount: Math.floor(i * 0.2),
      })
    );
  }

  return experiences;
}

export function sampleInjectionRequest() {
  return ExperienceInjectionRequestBuilder.create()
    .withRequestId("inj_req_sneaker")
    .withContext({
      capabilityId: asCapabilityId("text.generate"),
      department: "marketing",
      taskType: "product_launch",
      industry: "retail",
      language: "en",
      complexityTier: "moderate",
    })
    .withTopN(10)
    .withMaxContextItems(15)
    .withConflictStrategy("highest_confidence")
    .withMode("top_n")
    .build();
}

export async function setupExperienceInjectionPlatform(
  options: Partial<CreateExperienceInjectionOptions> & { seedCount?: number } = {}
): Promise<ExperienceInjectionPlatform> {
  const helpers = deterministicHelpers();
  const repository =
    options.repository ??
    new InMemoryExperienceRepository(helpers.nowIso, helpers.createId);

  if (!options.repository) {
    const seeds = makeSeedExperiences(options.seedCount ?? 200);
    repository.saveMany(seeds);
  }

  return createExperienceInjectionPlatform({
    repository,
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export async function setupInjectionFromExperienceIntelligence(
  batchSize = 50
): Promise<ExperienceInjectionPlatform> {
  const helpers = deterministicHelpers();
  const { engine: expEngine, repository } = setupExperienceIntelligencePlatform(helpers);
  await expEngine.process(sampleExperienceIntelligenceRequest(batchSize));
  return createExperienceInjectionPlatform({
    repository,
    ...helpers,
  });
}
