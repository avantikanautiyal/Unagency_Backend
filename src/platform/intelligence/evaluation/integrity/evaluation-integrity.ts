/**
 * M9.5P — Canonical evaluation integrity semantics.
 * Principle: NO EVALUATION IS BETTER THAN FAKE EVALUATION.
 */

export type EvaluationStatus =
  | "evaluated"
  | "partially_evaluated"
  | "not_supported"
  | "unavailable"
  | "failed";

export type EvaluationMethod =
  | "deterministic"
  | "model_judge"
  | "heuristic"
  | "benchmark"
  | "human"
  | "none";

export type EvaluationTrustLevel = "high" | "medium" | "low" | "none";

export type EvaluationMetricNamespace =
  | "QUALITY"
  | "RELIABILITY"
  | "LATENCY"
  | "COST"
  | "COMPLIANCE"
  | "SAFETY";

export type EvaluationDimension =
  | "correctness"
  | "relevance"
  | "instructionAdherence"
  | "groundedness"
  | "coherence"
  | "safety"
  | "formatCompliance"
  | "visualQuality"
  | "promptAlignment"
  | "technicalValidity"
  | "temporalConsistency"
  | "audioQuality"
  | "transcriptionAccuracy"
  | "toolCorrectness"
  | "schemaCompliance"
  | "voiceNaturalness"
  | "motionQuality";

export interface EvaluationIntegrity {
  readonly evaluationStatus: EvaluationStatus;
  readonly evaluationMethod: EvaluationMethod;
  readonly evaluationTrust: EvaluationTrustLevel;
  /** Only true when qualityScore may influence adaptive QUALITY routing. */
  readonly feedbackEligible: boolean;
  /** Semantic / creative quality for routing — null when unknown. NEVER invent. */
  readonly qualityScore: number | null;
  readonly confidence: number | null;
  readonly dimensions: Readonly<Partial<Record<EvaluationDimension, number | null>>>;
  readonly metricNamespaces: readonly EvaluationMetricNamespace[];
  readonly exclusionReason?: string;
  readonly judgeId?: string;
  readonly judgeVersion?: string;
  readonly rubricVersion?: string;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface EvaluationAttachPayload {
  readonly evaluationScore: number | null;
  readonly evaluationDimensions?: Readonly<Record<string, number>>;
  readonly feedbackEligible: boolean;
  readonly evaluationTrust: EvaluationTrustLevel;
  readonly evaluationMethod: EvaluationMethod;
  readonly evaluationStatus: EvaluationStatus;
  readonly judgeId?: string;
  readonly judgeVersion?: string;
  readonly rubricVersion?: string;
  readonly metricNamespace?: EvaluationMetricNamespace;
  readonly exclusionReason?: string;
}

const TRUST_RANK: Record<EvaluationTrustLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function parseEvaluationTrustLevel(
  raw: string | undefined,
  fallback: EvaluationTrustLevel = "medium"
): EvaluationTrustLevel {
  const v = (raw ?? fallback).toLowerCase();
  if (v === "high" || v === "medium" || v === "low" || v === "none") return v;
  return fallback;
}

export function trustMeetsMinimum(
  trust: EvaluationTrustLevel,
  minimum: EvaluationTrustLevel
): boolean {
  return TRUST_RANK[trust] >= TRUST_RANK[minimum];
}

/**
 * Placeholder / heuristic judges must NEVER feed adaptive QUALITY routing.
 */
export function integrityForPlaceholderJudges(input: {
  readonly overallScore: number;
  readonly confidenceScore?: number;
  readonly rubricVersion?: string;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "evaluated",
    evaluationMethod: "heuristic",
    evaluationTrust: "low",
    feedbackEligible: false,
    qualityScore: null,
    confidence:
      typeof input.confidenceScore === "number" ? input.confidenceScore : null,
    dimensions: {},
    metricNamespaces: [],
    exclusionReason: "placeholder_heuristic_judges",
    judgeId: "default_text_placeholder_pipeline",
    judgeVersion: "m95p-1",
    rubricVersion: input.rubricVersion,
    reason: "Placeholder judges produce display scores only; quality remains unknown",
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function integrityNotSupported(input: {
  readonly reason: string;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "not_supported",
    evaluationMethod: "none",
    evaluationTrust: "none",
    feedbackEligible: false,
    qualityScore: null,
    confidence: null,
    dimensions: {},
    metricNamespaces: [],
    exclusionReason: input.reason,
    reason: input.reason,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function integrityUnavailable(input: {
  readonly reason: string;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "unavailable",
    evaluationMethod: "none",
    evaluationTrust: "none",
    feedbackEligible: false,
    qualityScore: null,
    confidence: null,
    dimensions: {},
    metricNamespaces: [],
    exclusionReason: input.reason,
    reason: input.reason,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function integrityFailed(input: {
  readonly reason: string;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "failed",
    evaluationMethod: "none",
    evaluationTrust: "none",
    feedbackEligible: false,
    qualityScore: null,
    confidence: null,
    dimensions: {},
    metricNamespaces: [],
    exclusionReason: input.reason,
    reason: input.reason,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function integrityTechnicalCompliance(input: {
  readonly dimensions: Readonly<Partial<Record<EvaluationDimension, number | null>>>;
  readonly method?: EvaluationMethod;
  readonly judgeId?: string;
  readonly judgeVersion?: string;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "evaluated",
    evaluationMethod: input.method ?? "deterministic",
    evaluationTrust: "high",
    feedbackEligible: false,
    qualityScore: null,
    confidence: 1,
    dimensions: input.dimensions,
    metricNamespaces: ["COMPLIANCE"],
    exclusionReason: "technical_validation_only",
    judgeId: input.judgeId ?? "technical_validator",
    judgeVersion: input.judgeVersion ?? "m95p-1",
    reason: "Deterministic technical/compliance checks — not creative quality",
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function integrityTrustedQuality(input: {
  readonly qualityScore: number;
  readonly trust: EvaluationTrustLevel;
  readonly method: EvaluationMethod;
  readonly dimensions?: Readonly<Partial<Record<EvaluationDimension, number | null>>>;
  readonly judgeId: string;
  readonly judgeVersion: string;
  readonly confidence?: number | null;
  readonly nowIso?: string;
}): EvaluationIntegrity {
  return {
    evaluationStatus: "evaluated",
    evaluationMethod: input.method,
    evaluationTrust: input.trust,
    feedbackEligible: input.trust !== "none" && input.trust !== "low",
    qualityScore: input.qualityScore,
    confidence: input.confidence ?? null,
    dimensions: input.dimensions ?? {},
    metricNamespaces: ["QUALITY"],
    judgeId: input.judgeId,
    judgeVersion: input.judgeVersion,
    reason: "Trusted quality evaluation",
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function isQualityFeedbackEligible(
  integrity: Pick<
    EvaluationIntegrity,
    "feedbackEligible" | "qualityScore" | "evaluationTrust"
  >,
  minTrust: EvaluationTrustLevel
): boolean {
  if (!integrity.feedbackEligible) return false;
  if (integrity.qualityScore == null || !Number.isFinite(integrity.qualityScore)) {
    return false;
  }
  return trustMeetsMinimum(integrity.evaluationTrust, minTrust);
}

export function loadEvaluationIntegrityConfig(
  env: NodeJS.ProcessEnv = process.env
): {
  readonly enabled: boolean;
  readonly feedbackMinTrust: EvaluationTrustLevel;
  readonly maxDepth: number;
} {
  const enabled = (env.EVALUATION_ENABLED ?? "true").toLowerCase() !== "false";
  const feedbackMinTrust = parseEvaluationTrustLevel(
    env.EVALUATION_FEEDBACK_MIN_TRUST,
    "medium"
  );
  const maxDepth = Math.max(1, Number(env.EVALUATION_MAX_DEPTH ?? 1) || 1);
  return { enabled, feedbackMinTrust, maxDepth };
}
