/**
 * M9.5P — Deterministic technical / contract validators (compliance only).
 * Never invent creative quality scores.
 */

import {
  integrityNotSupported,
  integrityTechnicalCompliance,
  type EvaluationIntegrity,
} from "./evaluation-integrity";

export interface MediaArtifactEvidence {
  readonly organizationId: string;
  readonly artifactId?: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly aspectRatio?: string;
  readonly format?: string;
  readonly nonEmpty?: boolean;
  /** Caller-supplied tenant ownership — must match expected org. */
  readonly ownerOrganizationId?: string;
}

export interface EmbeddingVectorEvidence {
  readonly vectors: readonly (readonly number[])[];
  readonly expectedDimensions?: number;
  readonly expectedBatchCount?: number;
}

export interface StructuredOutputEvidence {
  readonly schemaValid: boolean;
  readonly schemaErrors?: readonly string[];
}

export interface SttBenchmarkEvidence {
  readonly hypothesis: string;
  readonly reference: string;
}

export function assertTenantMediaAccess(input: {
  readonly expectedOrganizationId: string;
  readonly evidence: MediaArtifactEvidence;
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const owner = input.evidence.ownerOrganizationId ?? input.evidence.organizationId;
  if (!owner || owner !== input.expectedOrganizationId) {
    return { ok: false, reason: "cross_tenant_media_denied" };
  }
  return { ok: true };
}

export function evaluateImageTechnical(
  evidence: MediaArtifactEvidence,
  expectedOrganizationId: string
): EvaluationIntegrity {
  const access = assertTenantMediaAccess({ expectedOrganizationId, evidence });
  if (!access.ok) {
    return integrityNotSupported({ reason: access.reason });
  }
  const mimeOk =
    !evidence.mimeType ||
    evidence.mimeType.startsWith("image/") ||
    evidence.mimeType === "application/octet-stream";
  const sizeOk = evidence.byteSize == null || evidence.byteSize > 0;
  const dimsOk =
    (evidence.width == null && evidence.height == null) ||
    (typeof evidence.width === "number" &&
      evidence.width > 0 &&
      typeof evidence.height === "number" &&
      evidence.height > 0);
  const nonEmpty = evidence.nonEmpty !== false;
  const pass = mimeOk && sizeOk && dimsOk && nonEmpty && Boolean(evidence.artifactId);
  return integrityTechnicalCompliance({
    dimensions: {
      technicalValidity: pass ? 1 : 0,
      formatCompliance: mimeOk && sizeOk ? 1 : 0,
      visualQuality: null,
      promptAlignment: null,
    },
    judgeId: "image_technical_validator",
  });
}

export function evaluateVideoTechnical(
  evidence: MediaArtifactEvidence,
  expectedOrganizationId: string,
  constraints?: { readonly minDurationSeconds?: number; readonly maxDurationSeconds?: number }
): EvaluationIntegrity {
  const access = assertTenantMediaAccess({ expectedOrganizationId, evidence });
  if (!access.ok) {
    return integrityNotSupported({ reason: access.reason });
  }
  const mimeOk =
    !evidence.mimeType ||
    evidence.mimeType.startsWith("video/") ||
    evidence.mimeType === "application/octet-stream";
  const sizeOk = evidence.byteSize == null || evidence.byteSize > 0;
  const durationOk =
    evidence.durationSeconds == null ||
    (evidence.durationSeconds > 0 &&
      (constraints?.minDurationSeconds == null ||
        evidence.durationSeconds >= constraints.minDurationSeconds) &&
      (constraints?.maxDurationSeconds == null ||
        evidence.durationSeconds <= constraints.maxDurationSeconds));
  const pass =
    mimeOk && sizeOk && durationOk && evidence.nonEmpty !== false && Boolean(evidence.artifactId);
  return integrityTechnicalCompliance({
    dimensions: {
      technicalValidity: pass ? 1 : 0,
      formatCompliance: mimeOk ? 1 : 0,
      temporalConsistency: null,
      visualQuality: null,
      promptAlignment: null,
      motionQuality: null,
    },
    judgeId: "video_technical_validator",
  });
}

export function evaluateAudioTechnical(
  evidence: MediaArtifactEvidence,
  expectedOrganizationId: string
): EvaluationIntegrity {
  const access = assertTenantMediaAccess({ expectedOrganizationId, evidence });
  if (!access.ok) {
    return integrityNotSupported({ reason: access.reason });
  }
  const mimeOk =
    !evidence.mimeType ||
    evidence.mimeType.startsWith("audio/") ||
    evidence.mimeType === "application/octet-stream";
  const sizeOk = evidence.byteSize == null || evidence.byteSize > 0;
  const durationOk = evidence.durationSeconds == null || evidence.durationSeconds > 0;
  const pass =
    mimeOk && sizeOk && durationOk && evidence.nonEmpty !== false && Boolean(evidence.artifactId);
  return integrityTechnicalCompliance({
    dimensions: {
      technicalValidity: pass ? 1 : 0,
      formatCompliance: mimeOk ? 1 : 0,
      audioQuality: null,
      voiceNaturalness: null,
    },
    judgeId: "audio_technical_validator",
  });
}

export function evaluateEmbeddingContract(
  evidence: EmbeddingVectorEvidence
): EvaluationIntegrity {
  const batchOk =
    evidence.expectedBatchCount == null ||
    evidence.vectors.length === evidence.expectedBatchCount;
  let dimsOk = evidence.vectors.length > 0;
  let numericOk = true;
  for (const v of evidence.vectors) {
    if (evidence.expectedDimensions != null && v.length !== evidence.expectedDimensions) {
      dimsOk = false;
    }
    if (v.length === 0) dimsOk = false;
    for (const n of v) {
      if (typeof n !== "number" || !Number.isFinite(n)) numericOk = false;
    }
  }
  const pass = batchOk && dimsOk && numericOk;
  return integrityTechnicalCompliance({
    dimensions: {
      technicalValidity: pass ? 1 : 0,
      formatCompliance: pass ? 1 : 0,
    },
    judgeId: "embedding_contract_validator",
  });
}

export function evaluateStructuredSchemaCompliance(
  evidence: StructuredOutputEvidence
): EvaluationIntegrity {
  return integrityTechnicalCompliance({
    dimensions: {
      schemaCompliance: evidence.schemaValid ? 1 : 0,
      formatCompliance: evidence.schemaValid ? 1 : 0,
      correctness: null,
    },
    judgeId: "structured_output_schema_validator",
  });
}

/** Simple word-error-rate when reference transcript is available. */
export function evaluateSttBenchmark(
  evidence: SttBenchmarkEvidence
): EvaluationIntegrity {
  const ref = tokenize(evidence.reference);
  const hyp = tokenize(evidence.hypothesis);
  if (ref.length === 0) {
    return integrityNotSupported({ reason: "empty_reference_transcript" });
  }
  const distance = levenshtein(ref, hyp);
  const wer = distance / ref.length;
  const accuracy = Math.max(0, Math.min(1, 1 - wer));
  return {
    evaluationStatus: "evaluated",
    evaluationMethod: "benchmark",
    evaluationTrust: "high",
    feedbackEligible: true,
    qualityScore: accuracy,
    confidence: 1,
    dimensions: {
      transcriptionAccuracy: accuracy,
      technicalValidity: 1,
    },
    metricNamespaces: ["QUALITY", "COMPLIANCE"],
    judgeId: "stt_wer_benchmark",
    judgeVersion: "m95p-1",
    reason: "Deterministic WER against reference transcript",
    createdAt: new Date().toISOString(),
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}
