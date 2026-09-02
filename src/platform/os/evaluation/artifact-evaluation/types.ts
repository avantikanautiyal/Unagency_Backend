/**
 * Step 6 — Evidence produced by automated artifact evaluation.
 * Consumed by Step 2 validators; generator models never self-certify.
 */

export type EvaluationConfidence =
  | "measured"
  | "heuristic"
  | "estimated"
  | "unverified"
  | "not_automated";

export type EvaluatorProvenanceEntry = {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly evaluationMethod: string;
  readonly evaluationTimestamp: string;
  readonly artifactIds: readonly string[];
  readonly confidence: EvaluationConfidence;
  readonly notes?: string;
};

export type AccessibilityViolation = {
  readonly id: string;
  readonly impact: "critical" | "serious" | "moderate" | "minor";
  readonly description: string;
  readonly selector?: string;
};

export type AccessibilityEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly violationCount: number;
  readonly criticalCount: number;
  readonly seriousCount: number;
  readonly violations: readonly AccessibilityViolation[];
  readonly score: number;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type SeoFinding = {
  readonly checkId: string;
  readonly passed: boolean;
  readonly detail: string;
};

export type SeoEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly findings: readonly SeoFinding[];
  readonly score: number;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type PerformanceMetricEvidence = {
  readonly metricId: string;
  readonly value: number;
  readonly unit: string;
  readonly threshold?: number;
  readonly measurementStatus: "MEASURED" | "NOT_AUTOMATED" | "NOT_APPLICABLE";
  readonly evidence: readonly string[];
};

export type PerformanceEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly ttfbMs?: number;
  readonly domContentLoadedMs?: number;
  readonly loadEventMs?: number;
  readonly lcpMs?: number;
  readonly clsScore?: number;
  readonly inpMs?: number;
  readonly pageWeightBytes?: number;
  readonly requestCount?: number;
  readonly score: number;
  readonly confidence: EvaluationConfidence;
  readonly measurementStatus?: "MEASURED" | "NOT_AUTOMATED" | "NOT_APPLICABLE";
  readonly metrics?: readonly PerformanceMetricEvidence[];
  readonly evidence: readonly string[];
};

export type VisualDimensionEvidence = {
  readonly dimensionId: string;
  readonly score: number;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type VisualEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly dimensions: readonly VisualDimensionEvidence[];
  readonly confidence: EvaluationConfidence;
};

export type BrandAdherenceEvidence = {
  readonly evaluated: boolean;
  readonly score: number;
  readonly matchedColors: readonly string[];
  readonly matchedTerms: readonly string[];
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type DocumentArtifactEvidence = {
  readonly evaluated: boolean;
  readonly isValidPdf: boolean;
  readonly isValidDocx?: boolean;
  readonly pageCount?: number;
  readonly byteSize: number;
  readonly sectionCount?: number;
  readonly textLength?: number;
  readonly headingCount?: number;
  readonly titlePresent?: boolean;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type PresentationArtifactEvidence = {
  readonly evaluated: boolean;
  readonly isValidPptx?: boolean;
  readonly isValidPdf?: boolean;
  readonly slideCount?: number;
  readonly pageCount?: number;
  readonly emptySlideCount?: number;
  readonly byteSize: number;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type EmailArtifactEvidence = {
  readonly evaluated: boolean;
  readonly htmlValid: boolean;
  readonly subjectPresent: boolean;
  readonly contentPresent: boolean;
  readonly ctaPresent: boolean;
  readonly linkCount: number;
  readonly imageCount: number;
  readonly brokenImageRefs: number;
  readonly viewportMeta: boolean;
  readonly tableLayout: boolean;
  readonly visibleTextLength: number;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type VideoArtifactEvidence = {
  readonly evaluated: boolean;
  readonly isReadable: boolean;
  readonly byteSize: number;
  readonly containerFormat?: string;
  readonly durationSec?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hasVideoStream?: boolean;
  readonly hasAudioStream?: boolean;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type ImageArtifactEvidence = {
  readonly evaluated: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteSize: number;
  readonly integrityOk: boolean;
  readonly aspectRatio?: string;
  readonly format?: string;
  readonly hasAlpha?: boolean;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type BuildEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly buildSucceeded?: boolean;
  readonly buildDurationMs?: number;
  readonly buildOutput?: string;
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
};

export type RuntimeEvaluationEvidence = {
  readonly evaluated: boolean;
  readonly status?: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly skipReason?: string;
  readonly startupSucceeded?: boolean;
  readonly runtimeErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly failedResourceLoads?: readonly string[];
  readonly confidence: EvaluationConfidence;
  readonly evidence: readonly string[];
  readonly viewportChecks?: readonly string[];
  readonly viewportResults?: readonly import("../runtime/browser-runtime-evaluator").ViewportEvaluationResult[];
  readonly routesVerified?: readonly string[];
  readonly browserAccessibility?: AccessibilityEvaluationEvidence;
  readonly failureCategory?: import("../runtime/browser-runtime-failure-classification").RuntimeFailureCategory;
};

export type HydratedArtifact = {
  readonly artifactId: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly bytes: Buffer;
  readonly kind: "html" | "pdf" | "image" | "pptx" | "docx" | "zip" | "other";
  readonly textContent?: string;
};

export type ArtifactEvaluationBundle = {
  readonly htmlContent?: string;
  readonly accessibility?: AccessibilityEvaluationEvidence;
  readonly seo?: SeoEvaluationEvidence;
  readonly performance?: PerformanceEvaluationEvidence;
  readonly visual?: VisualEvaluationEvidence;
  readonly brandAdherence?: BrandAdherenceEvidence;
  readonly document?: DocumentArtifactEvidence;
  readonly presentation?: PresentationArtifactEvidence;
  readonly email?: EmailArtifactEvidence;
  readonly image?: ImageArtifactEvidence;
  readonly video?: VideoArtifactEvidence;
  readonly build?: BuildEvaluationEvidence;
  readonly runtime?: RuntimeEvaluationEvidence;
  readonly provenance: readonly EvaluatorProvenanceEntry[];
};

export type ArtifactEvaluationInput = {
  readonly organizationId: string;
  readonly executionId: string;
  readonly outputKind?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly preview?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly briefObjective?: string;
  readonly brandColors?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly brandAvoidTerms?: readonly string[];
  readonly nowIso?: () => string;
  readonly hydrateArtifacts?: (
    artifactIds: readonly string[],
  ) => Promise<readonly HydratedArtifact[]>;
  readonly runRuntimeCheck?: (htmlContent: string) => Promise<RuntimeEvaluationEvidence>;
};

export type ArtifactEvaluationEnrichment = {
  readonly artifactRefs: readonly import("../output-validation/artifact-context").ValidationArtifactRef[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly preview?: string;
  readonly actualAspectRatio?: string;
  readonly artifactEvaluation: ArtifactEvaluationBundle;
  /** Step 7 — generalized evaluation plane result when plane orchestrator ran. */
  readonly evaluationPlaneResult?: import("../evaluation-plane/types").EvaluationPlaneResult;
};
