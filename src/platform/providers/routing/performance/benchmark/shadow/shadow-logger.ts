/**
 * Step 10 — Structured shadow logging (no secrets or private user content).
 */

import type { ShadowDecision, ShadowCandidateRef } from "./shadow-decision-contract";
import type { EvidenceTier } from "../evidence/evidence-collection-config";

export function logShadowSafetyGate(adaptiveRoutingEnabled: boolean): void {
  console.log(
    `[UNAGENCY-SHADOW] safety gate | adaptiveRoutingEnabled=${adaptiveRoutingEnabled}`,
  );
  if (adaptiveRoutingEnabled) {
    console.warn(
      "[UNAGENCY-SHADOW] WARNING: adaptive routing enabled — shadow layer remains observational only",
    );
  }
}

export function logShadowDecision(decision: ShadowDecision): void {
  console.log(
    [
      "[UNAGENCY-SHADOW]",
      `execution=${decision.productionExecutionId}`,
      `status=${decision.status}`,
      `actual=${decision.actual.providerId}/${decision.actual.modelId}`,
      `strategy=${decision.actual.strategyId}`,
      `knowledge=${decision.actual.knowledgeId ?? decision.actual.knowledgeVersion ?? "n/a"}`,
      decision.recommended
        ? `shadow=${decision.recommended.providerId}/${decision.recommended.modelId}+${decision.recommended.strategyId}`
        : "shadow=none",
      `confidence=${decision.confidenceTier}`,
      `evidence=${decision.evidenceTier}`,
      `promotion=${decision.promotionReadiness}`,
    ].join(" | "),
  );
}

export function logShadowComparison(input: {
  readonly actual: ShadowCandidateRef;
  readonly recommended: ShadowCandidateRef;
  readonly observedAdvantage?: number;
  readonly evidenceTier: EvidenceTier;
  readonly confidence: string;
}): void {
  const delta =
    input.observedAdvantage != null
      ? `${input.observedAdvantage >= 0 ? "+" : ""}${input.observedAdvantage.toFixed(1)}`
      : "n/a";
  console.log(
    [
      "[UNAGENCY-SHADOW-COMPARISON]",
      `actual=${input.actual.providerId}/${input.actual.modelId}+${input.actual.strategyId}`,
      `shadow=${input.recommended.providerId}/${input.recommended.modelId}+${input.recommended.strategyId}`,
      `historical_delta=${delta}`,
      `evidence=${input.evidenceTier}`,
      `confidence=${input.confidence}`,
      "wording=historical_evidence_under_comparable_conditions",
    ].join(" | "),
  );
}

export function logProductionEvidenceFailure(input: {
  readonly productionExecutionId: string;
  readonly stage: string;
  readonly message: string;
}): void {
  console.warn(
    `[UNAGENCY-PRODUCTION-EVIDENCE] failure | execution=${input.productionExecutionId} | stage=${input.stage} | ${input.message}`,
  );
}

export function logProductionEvidenceRecorded(input: {
  readonly productionExecutionId: string;
  readonly requestId?: string;
  readonly service: string;
  readonly subtype: string;
  readonly industry?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly strategyId: string;
  readonly knowledgeId?: string;
  readonly qualityScore?: number;
  readonly validationStatus: string;
  readonly evidenceSource: string;
  readonly evidenceMode: string;
}): void {
  console.log(
    [
      "[UNAGENCY-PRODUCTION-EVIDENCE]",
      `execution=${input.productionExecutionId}`,
      input.requestId ? `request=${input.requestId}` : null,
      `service=${input.service}/${input.subtype}`,
      input.industry ? `industry=${input.industry}` : null,
      `model=${input.providerId}/${input.modelId}`,
      `strategy=${input.strategyId}`,
      input.knowledgeId ? `knowledge=${input.knowledgeId}` : null,
      input.qualityScore != null ? `quality=${input.qualityScore.toFixed(1)}` : "quality=n/a",
      `validation=${input.validationStatus}`,
      `source=${input.evidenceSource}`,
      `mode=${input.evidenceMode}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}
