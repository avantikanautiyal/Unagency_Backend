import { InMemoryEventBus } from "../../../../src/platform/intelligence/events/implementations/in-memory-event-bus";
import { EventFactory } from "../../../../src/platform/intelligence/events/implementations/event-factory";
import { SystemClock, UuidGenerator } from "../../../../src/platform/intelligence/shared/utils";
import { createExecutionRuntime } from "../../../../src/platform/intelligence/execution-runtime/factories/create-execution-runtime";
import {
  createIntelligenceOrchestrator,
  createIntelligenceOrchestratorWithHooks,
} from "../../../../src/platform/intelligence/orchestrator/factories/create-orchestrator";
import type { ExecutionPlan } from "../../../../src/platform/intelligence/execution-planning/contracts/execution-plan";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../src/platform/intelligence/shared/identifiers";

export function samplePlan(): ExecutionPlan {
  return {
    planId: "plan_orch",
    capabilityId: asCapabilityId("analyzeBrief"),
    capabilityVersion: "1.0.0",
    executionStrategy: "direct",
    executionMode: "sequential",
    priority: "normal",
    providerSelection: {
      primaryProviderId: asProviderId("provider-a"),
      fallbackProviderIds: [asProviderId("provider-b")],
    },
    retry: { maxAttempts: 1, backoffMs: 10, strategy: "fixed" },
    timeout: { timeoutMs: 30_000 },
    budget: {},
    evaluation: { enabled: false },
    humanReview: { required: false },
    executionPolicy: { policyRefs: [] },
    routingConstraints: { requiredFeatures: [], excludedProviderIds: [] },
    graph: {
      entryNodeId: "n1",
      exitNodeId: "n2",
      nodes: [
        { id: "n1", kind: "capability", label: "cap", stageId: "s1", order: 0 },
        {
          id: "n2",
          kind: "provider",
          label: "prov",
          providerId: asProviderId("provider-a"),
          stageId: "s1",
          order: 1,
        },
      ],
      edges: [{ id: "e1", fromNodeId: "n1", toNodeId: "n2" }],
      stages: [
        {
          id: "s1",
          name: "main",
          mode: "sequential",
          order: 0,
          nodeIds: ["n1", "n2"],
        },
      ],
    },
    metadata: {
      planId: "plan_orch",
      capabilityId: asCapabilityId("analyzeBrief"),
      primaryProviderId: asProviderId("provider-a"),
      fallbackProviderIds: [asProviderId("provider-b")],
      strategy: "direct",
      priority: "normal",
      costEstimate: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

export function sampleRuntimeContext() {
  return {
    executionId: asExecutionId("exec_orch_1"),
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
  };
}

export function createOrchestratorFixture() {
  const eventBus = new InMemoryEventBus();
  const eventFactory = new EventFactory(new UuidGenerator(), new SystemClock());
  const runtime = createExecutionRuntime({ eventBus, eventFactory });
  const { orchestrator, hooks } = createIntelligenceOrchestratorWithHooks({
    runtime,
    includeDefaultMiddleware: true,
  });
  return { orchestrator, hooks, runtime };
}
