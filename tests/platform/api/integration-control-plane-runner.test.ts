/**
 * Control plane ingress — kernel → gateway → orchestrator → integration pipeline.
 */

import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";
import { setupIntelligenceOsIntegration } from "../../../src/platform/intelligence/integration/testing";
import { createProductionNegotiationPlatform } from "../../../src/platform/os/composition/create-production-negotiation";
import {
  bootstrapIntelligenceGateway,
  shutdownIntelligenceGateway,
} from "../../../src/platform/intelligence/gateway/factories/bootstrap-gateway";
import {
  IntegrationLayerJobExecutor,
  IntelligenceGatewayHolder,
} from "../../../src/platform/infrastructure/execution/workers/job-executors";
import { createDistributedExecutionPlatform } from "../../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";
import {
  runIntegrationViaControlPlane,
  resolveControlPlaneWorkspaceId,
} from "../../../src/platform/api/services/integration-control-plane-runner";

describe("integration control plane runner", () => {
  afterEach(async () => {
    await shutdownIntelligenceGateway();
  });

  it("defaults missing workspaceId for gateway routing", () => {
    expect(resolveControlPlaneWorkspaceId(undefined)).toBe("ws_default");
    expect(resolveControlPlaneWorkspaceId("  ")).toBe("ws_default");
    expect(resolveControlPlaneWorkspaceId("ws_acme")).toBe("ws_acme");
  });

  it("routes distributed jobs through IntelligenceGateway when wired", async () => {
    const dispatcher = new ControllableDispatcher();
    const integration = setupIntelligenceOsIntegration({
      runtimeDispatcher: dispatcher,
    }).engine;
    const capabilityRegistry = createProductionNegotiationPlatform({
      nowIso: () => new Date().toISOString(),
      createId: (p: string) => `${p}_test`,
    }).capabilityRegistry;

    const intelligencePlatform = await bootstrapIntelligenceGateway({
      integration,
      capabilityRegistry,
      registerMocks: false,
      autoStartKernel: true,
    });

    const gatewaySpy = jest.spyOn(intelligencePlatform.gateway, "invokeCapability");

    const holder = new IntelligenceGatewayHolder();
    holder.set(intelligencePlatform.gateway);

    const distributed = createDistributedExecutionPlatform({
      executor: new IntegrationLayerJobExecutor(
        integration,
        { executionMode: "simulated", integrationMode: "full" },
        holder
      ),
    }).engine;

    const enq = await distributed.enqueue({
      payload: {
        rawPrompt: "Write short campaign copy.",
        organizationId: "org_cp",
        correlationId: "corr_cp",
        capabilityHint: "text.generate",
        metadata: {
          capabilityId: "text.generate",
          integrationMode: "full",
        },
      },
      queueKind: "immediate",
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    distributed.registerWorker("execution", 1);
    await distributed.tick(1);

    expect(gatewaySpy).toHaveBeenCalled();
    const job = distributed.getJob(enq.value.jobId);
    expect(job.ok).toBe(true);
    if (!job.ok || !job.value?.resultSummary) return;
    expect(job.value.resultSummary.success).not.toBe(false);
    expect(typeof job.value.resultSummary.resultText).toBe("string");

    gatewaySpy.mockRestore();
  }, 60000);

  it("falls back to direct integration when gateway is absent", async () => {
    const integration = setupIntelligenceOsIntegration({
      runtimeDispatcher: new ControllableDispatcher(),
    }).engine;

    const run = await runIntegrationViaControlPlane({
      integration,
      capabilityId: "text.generate",
      organizationId: "org_direct",
      workspaceId: "ws_direct",
      request: {
        requestId: "req_direct",
        rawPrompt: "Hello",
        correlationId: "corr_direct",
        mode: "full",
        metadata: { capabilityId: "text.generate" },
      },
    });

    expect(run.ok).toBe(true);
  }, 60000);
});
