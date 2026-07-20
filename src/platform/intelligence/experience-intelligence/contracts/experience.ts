/**
 * Canonical immutable Experience object.
 */

import type { ExperienceId } from "./identifiers";
import type { ExperienceCategory, ExperienceLifecycle, ExperienceType } from "./enums";
import type { ApplicabilityConditions } from "./applicability";
import type { RootCause } from "./root-cause";
import type { CorrectionStrategy } from "./correction";
import type { ExperienceScores } from "./scoring";
import type { ExperienceExplanation } from "./explainability";

export interface Experience {
  readonly experienceId: ExperienceId;
  readonly category: ExperienceCategory;
  readonly type: ExperienceType;
  readonly trigger: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly rootCause: RootCause;
  readonly observedBehaviour: string;
  readonly correctionStrategy: CorrectionStrategy;
  readonly recommendation: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly supportingArtifactIds: readonly string[];
  readonly applicableConditions: ApplicabilityConditions;
  readonly capabilityId?: string;
  readonly department?: string;
  readonly industry?: string;
  readonly taskType?: string;
  readonly workflowId?: string;
  readonly executionStrategy?: string;
  readonly promptTemplateId?: string;
  readonly modelId?: string;
  readonly providerId?: string;
  readonly language?: string;
  readonly region?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly expiry?: string;
  readonly usageCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly averageImprovement: number;
  readonly scores: ExperienceScores;
  readonly explanation: ExperienceExplanation;
  readonly lifecycle: ExperienceLifecycle;
  readonly version: string;
  readonly createdAt: string;
}
