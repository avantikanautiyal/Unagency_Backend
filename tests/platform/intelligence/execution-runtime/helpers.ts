import { InMemoryEventBus } from "../../../../src/platform/intelligence/events/implementations/in-memory-event-bus";
import { EventFactory } from "../../../../src/platform/intelligence/events/implementations/event-factory";
import { SystemClock, UuidGenerator } from "../../../../src/platform/intelligence/shared/utils";
import { createExecutionRuntime } from "../../../../src/platform/intelligence/execution-runtime/factories/create-execution-runtime";
import type { ExecutionPlan } from "../../../../src/platform/intelligence/execution-planning/contracts/execution-plan";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../src/platform/intelligence/shared/identifiers";
import type { IExecutionRuntime } from "../../../../src/platform/intelligence/execution-runtime/interfaces/execution-runtime";
import type { ExecutionEventPayload } from "../../../../src/platform/intelligence/execution-runtime/events/execution-event-types";
import type { EventEnvelope } from "../../../../src/platform/intelligence/events/contracts/event-envelope";

export function createRuntimeFixture(): {
  runtime: IExecutionRuntime;
  eventBus: InMemoryEventBus;
  events: EventEnvelope<ExecutionEventPayload>[];
} {
  const eventBus = new InMemoryEventBus();
  const events: EventEnvelope<ExecutionEventPayload>[] = [];
  eventBus.subscribeAll((event) => {
    events.push(event as EventEnvelope<ExecutionEventPayload>);
  });

  const eventFactory = new EventFactory(new UuidGenerator(), new SystemClock());
  const runtime = createExecutionRuntime({ eventBus, eventFactory });

  return { runtime, eventBus, events };
}

export function samplePlan(): ExecutionPlan {
  return {
    planId: "plan_test",
    capabilityId: asCapabilityId("analyzeBrief"),
    capabilityVersion: "1.0.0",
    executionStrategy: "direct",
    executionMode: "sequential",
    priority: "normal",
    providerSelection: {
      primaryProviderId: asProviderId("provider-a"),
      fallbackProviderIds: [],
    },
    retry: { maxAttempts: 0, backoffMs: 0, strategy: "none" },
    timeout: { timeoutMs: 30_000 },
    budget: {},
    evaluation: { enabled: false },
    humanReview: { required: false },
    executionPolicy: { policyRefs: [] },
    routingConstraints: { requiredFeatures: [], excludedProviderIds: [] },
    graph: {
      entryNodeId: "n1",
      exitNodeId: "n3",
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
        { id: "n3", kind: "gate", label: "exit", stageId: "s2", order: 2 },
      ],
      edges: [
        { id: "e1", fromNodeId: "n1", toNodeId: "n2" },
        { id: "e2", fromNodeId: "n2", toNodeId: "n3" },
      ],
      stages: [
        {
          id: "s1",
          name: "main",
          mode: "sequential",
          order: 0,
          nodeIds: ["n1", "n2"],
        },
        {
          id: "s2",
          name: "exit",
          mode: "sequential",
          order: 1,
          nodeIds: ["n3"],
        },
      ],
    },
    metadata: {
      planId: "plan_test",
      capabilityId: asCapabilityId("analyzeBrief"),
      primaryProviderId: asProviderId("provider-a"),
      fallbackProviderIds: [],
      strategy: "direct",
      priority: "normal",
      costEstimate: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

export function sampleContext() {
  return {
    executionId: asExecutionId("exec_1"),
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
    correlationId: "corr_1",
  };
}
