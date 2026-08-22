/**
 * Production helpers for negotiation request construction.
 * Replaces testing makePlan/makeRequest/TEST_* usage on the Integration path.
 */

import {
  asCapabilityId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import type { ExecutionPlan } from "../../../execution-planning/contracts/execution-plan";
import type { NegotiationRequest } from "../contracts/negotiation-request";
import { NegotiationRequestBuilder } from "../builders/negotiation-request-builder";

export function buildProductionNegotiationPlan(input: {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly primaryProviderId: string;
  readonly modelId: string;
  readonly maxCost: number;
  readonly nowIso: string;
}): ExecutionPlan {
  const capabilityId = asCapabilityId(input.capabilityId);
  const primaryProviderId = asProviderId(input.primaryProviderId);
  return {
    planId: `plan_${input.requestId}`,
    capabilityId,
    executionStrategy: "direct",
    executionMode: "sequential",
    priority: "normal",
    providerSelection: {
      primaryProviderId,
      fallbackProviderIds: [],
      modelId: input.modelId,
    },
    retry: { maxAttempts: 2, backoffMs: 100, strategy: "fixed" },
    timeout: { timeoutMs: 120000 },
    budget: { maxCost: input.maxCost, currency: "USD" },
    evaluation: { enabled: false },
    humanReview: { required: false },
    executionPolicy: { policyRefs: [] },
    routingConstraints: { requiredFeatures: [], excludedProviderIds: [] },
    graph: {
      entryNodeId: "n1",
      exitNodeId: "n1",
      nodes: [
        { id: "n1", kind: "capability", label: "cap", stageId: "s1", order: 0 },
      ],
      edges: [],
      stages: [
        { id: "s1", name: "stage", mode: "sequential", order: 0, nodeIds: ["n1"] },
      ],
    },
    metadata: {
      planId: `plan_${input.requestId}`,
      capabilityId,
      primaryProviderId,
      fallbackProviderIds: [],
      strategy: "direct",
      priority: "normal",
      costEstimate: { estimatedCost: input.maxCost },
      createdAt: input.nowIso,
    },
  };
}

export function buildProductionNegotiationRequest(input: {
  readonly requestId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly plan: ExecutionPlan;
}): NegotiationRequest {
  const workspaceId = input.workspaceId?.trim() || `ws_${input.organizationId}`;
  const built = new NegotiationRequestBuilder()
    .withRequestId(`${input.requestId}_neg`)
    .withPlan(input.plan)
    .withOrganization(asOrganizationId(input.organizationId))
    .withWorkspace(asWorkspaceId(workspaceId))
    .build();
  return built;
}
