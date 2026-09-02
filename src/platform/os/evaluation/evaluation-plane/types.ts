/**
 * Step 7 — Generalized evaluation context and evidence types.
 * Modality-agnostic; consumed by Step 2 via the step2 bridge.
 */

import type { ServiceOutputKind } from "../../../config/service-output-map";
import type { HydratedArtifact } from "../artifact-evaluation/types";

export type MeasurementStatus =
  | "MEASURED"
  | "HEURISTIC"
  | "MODEL_JUDGED"
  | "NOT_AUTOMATED"
  | "NOT_APPLICABLE"
  | "UNVERIFIED";

export type EvaluationMode = "static" | "rendered" | "runtime" | "independent_judgement";

export type EvaluationContext = {
  readonly executionId: string;
  readonly organizationId: string;
  readonly benchmarkId?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly outputKind?: ServiceOutputKind | string;
  readonly contractId?: string;
  readonly contractVersion?: string;
  readonly preview?: string;
  readonly structuredOutput?: unknown;
  readonly briefObjective?: string;
  readonly mediaArtifactIds?: readonly string[];
  readonly artifactRefs?: readonly {
    readonly artifactId: string;
    readonly kind: string;
    readonly mimeType?: string;
  }[];
  readonly brandColors?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly brandAvoidTerms?: readonly string[];
  readonly brandVoice?: string;
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly strategyVersion?: string;
  readonly knowledgeVersion?: string;
  readonly generatorModelId?: string;
  readonly generatorProviderId?: string;
};

export type ObjectiveMetric = {
  readonly metricId: string;
  readonly dimension: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
  readonly threshold?: number;
  readonly status: "PASS" | "FAIL" | "UNVERIFIED";
  readonly measurementMethod: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly measurementStatus: MeasurementStatus;
  readonly evidence: readonly string[];
  readonly confidence: MeasurementStatus;
  readonly artifactId?: string;
};

export type ModalityCapabilities = {
  readonly outputKind: string;
  readonly supportsStatic: boolean;
  readonly supportsRendered: boolean;
  readonly supportsRuntime: boolean;
  readonly supportsIndependentJudgement: boolean;
  readonly applicableDimensions: readonly string[];
  readonly notApplicableDimensions: readonly string[];
};

export type ApplicabilityRecord = {
  readonly dimensionId: string;
  readonly status: MeasurementStatus;
  readonly reason: string;
};

export type IndependentJudgementInput = {
  readonly renderReference: string;
  readonly dimensionId: string;
  readonly briefObjective?: string;
};

export type IndependentJudgementResult = {
  readonly dimensionId: string;
  readonly score: number;
  readonly evidence: readonly string[];
  readonly measurementStatus: "MODEL_JUDGED";
  readonly evaluatorModelId?: string;
  readonly evaluatorProviderId?: string;
};

export type EvaluationPlaneInput = EvaluationContext & {
  readonly nowIso?: () => string;
  readonly hydrateArtifacts?: (ids: readonly string[]) => Promise<readonly HydratedArtifact[]>;
  readonly runRuntimeCheck?: (
    content: string,
  ) => Promise<import("../artifact-evaluation/types").RuntimeEvaluationEvidence & {
    readonly performanceReadings?: readonly import("../runtime/browser-runtime-evaluator").BrowserPerformanceReading[];
    readonly browserAccessibility?: import("../artifact-evaluation/types").AccessibilityEvaluationEvidence;
  }>;
  readonly runIndependentJudgement?: (
    input: IndependentJudgementInput,
  ) => Promise<IndependentJudgementResult | undefined>;
};

export type EvaluationStageTrace = {
  readonly artifactRender: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly artifactRenderReason?: string;
  readonly runtimeEvaluation: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly runtimeEvaluationReason?: string;
};

export type EvaluationPlaneResult = {
  readonly planeId: string;
  readonly planeVersion: string;
  readonly modality: ModalityCapabilities;
  readonly applicability: readonly ApplicabilityRecord[];
  readonly metrics: readonly ObjectiveMetric[];
  readonly modesExecuted: readonly EvaluationMode[];
  readonly hydratedArtifactCount: number;
  readonly stageTrace?: EvaluationStageTrace;
};
