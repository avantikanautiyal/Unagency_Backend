/**
 * Capability Intelligence outputs.
 */

import type {
  CapabilityBundleId,
  CapabilityExecutionPlanId,
  CapabilityIntelligenceResultId,
} from "./identifiers";
import type { CapabilityIntelligenceRequest } from "./request";
import type { CapabilityBundle, CapabilityDependencies, CapabilityGraph } from "./graph";
import type {
  CapabilityCompatibilityReport,
  CapabilityMaturityReport,
  CapabilityRecommendations,
  CapabilityScorecard,
} from "./scoring";
import type { CompositionShape } from "./enums";

export interface CapabilityExecutionStep {
  readonly stepId: string;
  readonly order: number;
  readonly capabilityId: string;
  readonly stage: number;
  readonly dependsOnStepIds: readonly string[];
  readonly rationale: string;
}

export interface CapabilityExecutionPlan {
  readonly planId: CapabilityExecutionPlanId;
  readonly requestId: string;
  readonly businessObjective: string;
  readonly bundleId: CapabilityBundleId;
  readonly shape: CompositionShape;
  readonly steps: readonly CapabilityExecutionStep[];
  readonly capabilityIds: readonly string[];
  readonly graph: CapabilityGraph;
  readonly version: string;
  readonly createdAt: string;
  readonly explanation: string;
}

export interface CapabilityIntelligenceReport {
  readonly resultId: CapabilityIntelligenceResultId;
  readonly requestId: string;
  readonly request: CapabilityIntelligenceRequest;
  readonly bundle: CapabilityBundle;
  readonly graph: CapabilityGraph;
  readonly dependencies: CapabilityDependencies;
  readonly executionPlan: CapabilityExecutionPlan;
  readonly recommendations: CapabilityRecommendations;
  readonly maturityReports: readonly CapabilityMaturityReport[];
  readonly compatibility: CapabilityCompatibilityReport;
  readonly scorecards: readonly CapabilityScorecard[];
  readonly durationMs: number;
  readonly createdAt: string;
}
