/**
 * Step 13 — Startup validation for adaptive routing policies.
 */

import type { AdaptiveRoutingPolicy } from "./routing-policy-contract";
import type { AdaptiveCapabilityVerdict } from "./adaptive-candidate-capability";
import { verifyAdaptiveCandidateCapability } from "./adaptive-candidate-capability";
import type { ICompatibilityEngine, IModelRegistry } from "../../../../../model-registry/interfaces/model-registry";
import type { IProviderRuntimeRegistry } from "../../../../runtime/registry/in-memory-provider-runtime-registry";

export type PolicyValidationResult = {
  readonly policyId: string;
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly capability?: AdaptiveCapabilityVerdict;
};

export function validateAdaptivePolicy(input: {
  readonly policy: AdaptiveRoutingPolicy;
  readonly nowIso: () => string;
  readonly providerRegistry: IProviderRuntimeRegistry;
  readonly modelRegistry: IModelRegistry;
  readonly compatibilityEngine: ICompatibilityEngine;
}): PolicyValidationResult {
  const reasons: string[] = [];
  const p = input.policy;

  if (!p.policyId?.trim()) reasons.push("missing policyId");
  if (!p.policyVersion?.trim()) reasons.push("missing policyVersion");
  if (!p.candidate?.providerId) reasons.push("missing candidate providerId");
  if (!p.candidate?.modelId) reasons.push("missing candidate modelId");
  if (!p.promotionCandidateId?.trim()) reasons.push("missing promotionCandidateId");
  if (p.lifecycle === "ACTIVE" && !p.approvedBy?.trim()) {
    reasons.push("ACTIVE policy missing approvedBy");
  }
  if (p.lifecycle === "ACTIVE" && !p.approvedAt?.trim()) {
    reasons.push("ACTIVE policy missing approvedAt");
  }
  if (p.expiresAt && p.expiresAt < input.nowIso()) {
    reasons.push("policy expired");
  }
  if (p.rolloutPercentage < 0 || p.rolloutPercentage > 100) {
    reasons.push("invalid rolloutPercentage");
  }
  if (p.minimumSamples < 1) reasons.push("minimumSamples below 1");
  if (p.maxCostIncrease < 1) reasons.push("maxCostIncrease below 1");
  if (p.maxLatencyIncrease < 1) reasons.push("maxLatencyIncrease below 1");

  const capability = verifyAdaptiveCandidateCapability({
    context: {
      providerId: p.candidate.providerId,
      modelId: p.candidate.modelId,
      capabilityId: "text.generate",
      service: p.scope.service,
      subtype: p.scope.subtype,
    },
    providerRegistry: input.providerRegistry,
    modelRegistry: input.modelRegistry,
    compatibilityEngine: input.compatibilityEngine,
  });
  if (!capability.executable) {
    reasons.push(...capability.reasons);
  }

  return Object.freeze({
    policyId: p.policyId,
    valid: reasons.length === 0,
    reasons: Object.freeze(reasons),
    capability,
  });
}

export async function validateActivePoliciesAtStartup(input: {
  readonly policies: readonly AdaptiveRoutingPolicy[];
  readonly nowIso: () => string;
  readonly providerRegistry: IProviderRuntimeRegistry;
  readonly modelRegistry: IModelRegistry;
  readonly compatibilityEngine: ICompatibilityEngine;
  readonly onInvalid?: (result: PolicyValidationResult) => Promise<void>;
}): Promise<{
  readonly valid: readonly AdaptiveRoutingPolicy[];
  readonly invalid: readonly PolicyValidationResult[];
}> {
  const valid: AdaptiveRoutingPolicy[] = [];
  const invalid: PolicyValidationResult[] = [];

  for (const policy of input.policies) {
    if (policy.lifecycle !== "ACTIVE") continue;
    const result = validateAdaptivePolicy({
      policy,
      nowIso: input.nowIso,
      providerRegistry: input.providerRegistry,
      modelRegistry: input.modelRegistry,
      compatibilityEngine: input.compatibilityEngine,
    });
    if (result.valid) {
      valid.push(policy);
    } else {
      invalid.push(result);
      if (input.onInvalid) await input.onInvalid(result);
    }
  }

  return Object.freeze({ valid: Object.freeze(valid), invalid: Object.freeze(invalid) });
}
