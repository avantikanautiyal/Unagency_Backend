/**
 * Offline-only trusted fake quality evaluator for certification.
 * Never used as a production default judge.
 */

import {
  integrityTrustedQuality,
  type EvaluationIntegrity,
  type EvaluationTrustLevel,
} from "./evaluation-integrity";

export interface TrustedFakeEvaluatorInput {
  readonly text: string;
  readonly expectedKeywords?: readonly string[];
  readonly judgeId?: string;
  readonly trust?: EvaluationTrustLevel;
}

/**
 * Deterministic offline quality judge: score from keyword coverage.
 * Marked feedbackEligible when trust >= medium.
 */
export function evaluateTrustedFakeTextQuality(
  input: TrustedFakeEvaluatorInput
): EvaluationIntegrity {
  const keywords = input.expectedKeywords ?? [];
  const lower = input.text.toLowerCase();
  if (!input.text.trim()) {
    return integrityTrustedQuality({
      qualityScore: 0,
      trust: input.trust ?? "medium",
      method: "heuristic",
      dimensions: { relevance: 0, correctness: 0 },
      judgeId: input.judgeId ?? "trusted_fake_text_judge",
      judgeVersion: "m95p-cert-1",
      confidence: 1,
    });
  }
  if (keywords.length === 0) {
    return integrityTrustedQuality({
      qualityScore: 0.8,
      trust: input.trust ?? "medium",
      method: "heuristic",
      dimensions: { relevance: 0.8, coherence: 0.8 },
      judgeId: input.judgeId ?? "trusted_fake_text_judge",
      judgeVersion: "m95p-cert-1",
      confidence: 0.9,
    });
  }
  const hits = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
  const score = hits / keywords.length;
  return integrityTrustedQuality({
    qualityScore: score,
    trust: input.trust ?? "medium",
    method: "heuristic",
    dimensions: {
      relevance: score,
      instructionAdherence: score,
      correctness: score,
    },
    judgeId: input.judgeId ?? "trusted_fake_text_judge",
    judgeVersion: "m95p-cert-1",
    confidence: 1,
  });
}

export function evaluateTrustedFakeImageQuality(input: {
  readonly promptAligned: boolean;
  readonly visualAcceptable: boolean;
}): EvaluationIntegrity {
  const score = (input.promptAligned ? 0.5 : 0) + (input.visualAcceptable ? 0.5 : 0);
  return integrityTrustedQuality({
    qualityScore: score,
    trust: "medium",
    method: "heuristic",
    dimensions: {
      promptAlignment: input.promptAligned ? 1 : 0,
      visualQuality: input.visualAcceptable ? 1 : 0,
      technicalValidity: 1,
    },
    judgeId: "trusted_fake_image_judge",
    judgeVersion: "m95p-cert-1",
    confidence: 0.85,
  });
}
