/**
 * Capability Intelligence testing utilities.
 */

import { CapabilityIntelligenceRequestBuilder } from "../builders/capability-intelligence-request-builder";
import {
  createCapabilityIntelligencePlatform,
  type CreateCapabilityIntelligenceOptions,
  type CapabilityIntelligencePlatform,
} from "../factories/create-capability-intelligence-platform";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 4),
  };
}

export function sampleMarketingObjectiveRequest() {
  return CapabilityIntelligenceRequestBuilder.create()
    .withRequestId("cap_req_marketing")
    .withBusinessObjective(
      "Launch a social carousel and email campaign with strong marketing copywriting"
    )
    .withDiscovery({
      department: "marketing",
      keywords: ["carousel", "email", "copywriting"],
      industry: "saas",
    })
    .build();
}

export function sampleSoftwareObjectiveRequest() {
  return CapabilityIntelligenceRequestBuilder.create()
    .withRequestId("cap_req_software")
    .withBusinessObjective("Generate application code, review it, then refactor for quality")
    .withPreferredCapabilities([
      "software.code_generation",
      "software.code_review",
      "software.refactoring",
    ])
    .withDiscovery({ department: "software" })
    .build();
}

export function sampleStrategyObjectiveRequest() {
  return CapabilityIntelligenceRequestBuilder.create()
    .withRequestId("cap_req_strategy")
    .withBusinessObjective("Develop business strategy from market analysis")
    .withPreferredCapabilities(["business.strategy"])
    .withDiscovery({ department: "business", keywords: ["strategy", "market"] })
    .build();
}

export function setupCapabilityIntelligencePlatform(
  options: CreateCapabilityIntelligenceOptions = {}
): CapabilityIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createCapabilityIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
