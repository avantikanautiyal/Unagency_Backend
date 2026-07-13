/**
 * Routing testing utilities.
 */

import {
  asCapabilityId,
  asProviderId,
  type CapabilityId,
  type ProviderId,
} from "../../../shared/identifiers";
import type { RoutingCandidate } from "../contracts/candidate";
import type { RoutingStrategyKind } from "../contracts/enums";
import type { RoutingRequest } from "../contracts/request";
import { RoutingRequestBuilder } from "../builders/routing-request-builder";
import {
  createRoutingPlatform,
  type CreateRoutingPlatformOptions,
  type RoutingPlatform,
} from "../factories/create-routing-platform";

export const TEST_CAPABILITY_ID: CapabilityId = asCapabilityId("text.generate");

export interface MakeCandidateOverrides {
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly modelId?: string;
  readonly healthy?: boolean;
  readonly estimatedLatencyMs?: number;
  readonly estimatedCost?: number;
  readonly qualityScore?: number;
  readonly region?: string;
  readonly priority?: number;
}

export function makeCandidate(
  overrides: MakeCandidateOverrides
): RoutingCandidate {
  return {
    providerId: overrides.providerId,
    vendor: overrides.vendor,
    modelId: overrides.modelId ?? "model-1",
    region: overrides.region ?? "us-east-1",
    capabilities: [String(TEST_CAPABILITY_ID)],
    healthy: overrides.healthy ?? true,
    healthState: overrides.healthy === false ? "unhealthy" : "healthy",
    estimatedLatencyMs: overrides.estimatedLatencyMs ?? 100,
    estimatedCost: overrides.estimatedCost ?? 1,
    qualityScore: overrides.qualityScore ?? 0.8,
    availability: overrides.healthy === false ? 0 : 1,
    priority: overrides.priority ?? 5,
  };
}

/** Ten-provider fixture for success-criteria tests. */
export function makeTenCandidates(): RoutingCandidate[] {
  return Array.from({ length: 10 }, (_, i) =>
    makeCandidate({
      providerId: asProviderId(`provider-${i + 1}`),
      vendor: `vendor-${i + 1}`,
      estimatedLatencyMs: 50 + i * 20,
      estimatedCost: 10 - i * 0.5,
      qualityScore: 0.5 + i * 0.05,
      priority: i + 1,
      region: i % 2 === 0 ? "us-east-1" : "eu-west-1",
    })
  );
}

export function makeRoutingRequest(
  candidates: readonly RoutingCandidate[],
  strategy: RoutingStrategyKind = "balanced"
): RoutingRequest {
  return RoutingRequestBuilder.create()
    .withRequestId("route_req_1")
    .withCapabilityId(TEST_CAPABILITY_ID)
    .withCandidates(candidates)
    .withStrategy(strategy)
    .build();
}

export function deterministicHelpers() {
  let idCounter = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupRoutingPlatform(
  options: CreateRoutingPlatformOptions = {}
): RoutingPlatform {
  const helpers = deterministicHelpers();
  return createRoutingPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
