/**
 * Learning Intelligence Platform immutable contracts.
 * Observes, analyzes, recommends — never modifies platform behavior.
 */

import type { ArtifactSnapshot, ArtifactType } from "../../artifacts/contracts/artifact-models";
import type {
  CapabilityId,
  ExecutionId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type LearningScopeKind =
  | "platform"
  | "organization"
  | "workspace"
  | "project"
  | "campaign"
  | "task"
  | "capability"
  | "conversation"
  | "session";

export type LearningSignalKind =
  | "quality"
  | "latency"
  | "cost"
  | "brand"
  | "prompt"
  | "provider"
  | "human"
  | "workflow"
  | "evaluation"
  | "knowledge"
  | "memory"
  | "routing"
  | "pattern"
  | "anomaly";

export type RecommendationType =
  | "improvement"
  | "investigation"
  | "optimization_hint"
  | "policy_review"
  | "quality_alert"
  | "cost_alert"
  | "latency_alert"
  | "brand_alignment"
  | "routing_adjustment"
  | "experiment_suggestion";

export type AffectedModule =
  | "context"
  | "knowledge"
  | "prompt-compiler"
  | "providers"
  | "execution-runtime"
  | "evaluation"
  | "memory"
  | "orchestrator"
  | "gateway"
  | "workflow"
  | "policies"
  | "routing";

export type PatternKind =
  | "recurring_failure"
  | "quality_degradation"
  | "latency_spike"
  | "cost_increase"
  | "brand_drift"
  | "evaluation_failure"
  | "human_review_spike"
  | "routing_imbalance";

export type ExperimentKind = "ab_test" | "shadow_evaluation" | "regression_test";

export type ExperimentStatus = "draft" | "running" | "completed" | "cancelled";

export interface LearningIdentity {
  readonly learningId: string;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: UserId;
  readonly capabilityId?: CapabilityId;
  readonly executionId?: ExecutionId;
  readonly correlationId?: string;
}

export interface LearningScope {
  readonly kind: LearningScopeKind;
  readonly scopeId: string;
  readonly parentScopeId?: string;
}

export interface LearningEvidence {
  readonly evidenceId: string;
  readonly artifactId?: string;
  readonly artifactType?: ArtifactType;
  readonly description: string;
  readonly metric?: string;
  readonly value?: number | string | boolean;
  readonly observedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LearningSignal {
  readonly signalId: string;
  readonly kind: LearningSignalKind;
  readonly sourceArtifactId: string;
  readonly sourceArtifactType: ArtifactType;
  readonly value: number;
  readonly normalizedValue: number;
  readonly label: string;
  readonly extractedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LearningPattern {
  readonly patternId: string;
  readonly kind: PatternKind;
  readonly description: string;
  readonly frequency: number;
  readonly confidence: number;
  readonly signalIds: readonly string[];
  readonly detectedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LearningInsight {
  readonly insightId: string;
  readonly title: string;
  readonly description: string;
  readonly severity: "info" | "warning" | "critical";
  readonly patternId?: string;
  readonly signalIds: readonly string[];
  readonly generatedAt: string;
}

export interface LearningRecommendation {
  readonly recommendationId: string;
  readonly type: RecommendationType;
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: readonly LearningEvidence[];
  readonly affectedModule: AffectedModule;
  readonly applicableScope: LearningScope;
  readonly signalIds: readonly string[];
  readonly patternId?: string;
  readonly generatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LearningStatisticAggregate {
  readonly name: string;
  readonly count: number;
  readonly sum: number;
  readonly average: number;
  readonly min: number;
  readonly max: number;
}

export interface LearningStatisticTrend {
  readonly name: string;
  readonly direction: "up" | "down" | "stable";
  readonly delta: number;
  readonly period: string;
}

export interface LearningStatisticDistribution {
  readonly name: string;
  readonly buckets: Readonly<Record<string, number>>;
}

export interface LearningStatisticFrequency {
  readonly name: string;
  readonly occurrences: Readonly<Record<string, number>>;
}

export interface LearningStatistics {
  readonly statisticsId: string;
  readonly aggregates: readonly LearningStatisticAggregate[];
  readonly trends: readonly LearningStatisticTrend[];
  readonly distributions: readonly LearningStatisticDistribution[];
  readonly frequencies: readonly LearningStatisticFrequency[];
  readonly computedAt: string;
}

export interface LearningExperiment {
  readonly experimentId: string;
  readonly kind: ExperimentKind;
  readonly name: string;
  readonly status: ExperimentStatus;
  readonly hypothesis?: string;
  readonly scope: LearningScope;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LearningSummary {
  readonly summaryId: string;
  readonly signalCount: number;
  readonly patternCount: number;
  readonly recommendationCount: number;
  readonly insightCount: number;
  readonly artifactCount: number;
  readonly highlights: readonly string[];
  readonly generatedAt: string;
}

export interface LearningRequest {
  readonly requestId: string;
  readonly identity: LearningIdentity;
  readonly scope: LearningScope;
  readonly artifacts: readonly ArtifactSnapshot[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface LearningResult {
  readonly requestId: string;
  readonly identity: LearningIdentity;
  readonly signals: readonly LearningSignal[];
  readonly patterns: readonly LearningPattern[];
  readonly statistics: LearningStatistics;
  readonly insights: readonly LearningInsight[];
  readonly recommendations: readonly LearningRecommendation[];
  readonly summary: LearningSummary;
  readonly generatedAt: string;
}
