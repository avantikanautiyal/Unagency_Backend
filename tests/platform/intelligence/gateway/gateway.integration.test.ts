import {
  bootstrapIntelligenceGateway,
  shutdownIntelligenceGateway,
} from "../../../../src/platform/intelligence/gateway/factories/bootstrap-gateway";
import { ExecutionEventTypes } from "../../../../src/platform/intelligence/execution-runtime/events/execution-event-types";
import type { EventEnvelope } from "../../../../src/platform/intelligence/events/contracts/event-envelope";

describe("Intelligence Gateway integration", () => {
  afterEach(async () => {
    await shutdownIntelligenceGateway();
  });

  it("invokes echo capability end-to-end", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const result = await platform.gateway.invokeCapability({
      capabilityId: "echo",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { message: "Hello" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.output).toEqual({ message: "Hello" });
    expect(result.value.planId).toBeTruthy();
    expect(result.value.sessionId).toBeTruthy();
  });

  it("invokes uppercase capability", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const result = await platform.gateway.invokeCapability({
      capabilityId: "uppercase",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { text: "unagency" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({ text: "UNAGENCY" });
    }
  });

  it("invokes summarize_mock capability", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const result = await platform.gateway.invokeCapability({
      capabilityId: "summarize_mock",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { text: "Very long content..." },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({ summary: "Mock summary." });
    }
  });

  it("invokes translate_mock capability", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const result = await platform.gateway.invokeCapability({
      capabilityId: "translate_mock",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { text: "Hello", language: "fr" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toEqual({
        translation: "Bonjour (mock)",
      });
    }
  });

  it("validates capabilities", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const ok = await platform.gateway.validateCapability({
      capabilityId: "echo",
    });
    expect(ok.ok).toBe(true);

    const missing = await platform.gateway.validateCapability({
      capabilityId: "does_not_exist",
    });
    expect(missing.ok).toBe(false);
  });

  it("retrieves execution and status", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const invoked = await platform.gateway.invokeCapability({
      capabilityId: "echo",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { message: "Hi" },
    });
    expect(invoked.ok).toBe(true);
    if (!invoked.ok) return;

    const execution = await platform.gateway.getExecution(
      invoked.value.sessionId
    );
    expect(execution.ok).toBe(true);

    const status = await platform.gateway.getExecutionStatus(
      invoked.value.sessionId
    );
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.value.state).toBe("completed");
    }
  });

  it("reports gateway health", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const health = await platform.gateway.health();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.value.status).toBe("healthy");
    const names = health.value.components.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "kernel",
        "capability-registry",
        "provider-registry",
        "planning-engine",
        "orchestrator",
        "runtime",
      ])
    );
  });

  it("supports pause and resume via harness-started session", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const plan = await platform.harness.planning.produceExecutionPlan({
      capabilityId: "echo" as never,
      organizationId: "org_1" as never,
      workspaceId: "ws_1" as never,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const session = await platform.harness.runtime.createSession({
      context: {
        executionId: "exec_pause" as never,
        organizationId: "org_1" as never,
        workspaceId: "ws_1" as never,
      },
      plan: plan.value,
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    await session.value.start();
    const paused = await platform.gateway.pauseExecution(session.value.sessionId);
    expect(paused.ok).toBe(true);

    const resumed = await platform.gateway.resumeExecution(
      session.value.sessionId
    );
    expect(resumed.ok).toBe(true);

    const status = await platform.gateway.getExecutionStatus(
      session.value.sessionId
    );
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.value.state).toBe("completed");
    }
  });

  it("supports cancellation via harness-started session", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const plan = await platform.harness.planning.produceExecutionPlan({
      capabilityId: "echo" as never,
      organizationId: "org_1" as never,
      workspaceId: "ws_1" as never,
    });
    if (!plan.ok) return;

    const session = await platform.harness.runtime.createSession({
      context: {
        executionId: "exec_cancel" as never,
        organizationId: "org_1" as never,
        workspaceId: "ws_1" as never,
      },
      plan: plan.value,
    });
    if (!session.ok) return;

    await session.value.start();
    const cancelled = await platform.gateway.cancelExecution(
      session.value.sessionId,
      "test_cancel"
    );
    expect(cancelled.ok).toBe(true);

    const status = await platform.gateway.getExecutionStatus(
      session.value.sessionId
    );
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.value.state).toBe("cancelled");
    }
  });

  it("propagates lifecycle events on the event bus", async () => {
    const platform = await bootstrapIntelligenceGateway();
    const events: EventEnvelope[] = [];
    platform.harness.eventBus.subscribeAll((event) => {
      events.push(event);
    });

    await platform.gateway.invokeCapability({
      capabilityId: "echo",
      organizationId: "org_1",
      workspaceId: "ws_1",
      input: { message: "Hello" },
    });

    const types = events.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        ExecutionEventTypes.EXECUTION_CREATED,
        ExecutionEventTypes.EXECUTION_STARTED,
        ExecutionEventTypes.EXECUTION_COMPLETED,
      ])
    );
  });
});
