/**
 * M9.2D2 — Live provider execution & execution mode tests.
 */

import {
  parseEnterpriseApiExecutionModeFromEnv,
  validateEnterpriseApiExecutionConfig,
  resolveEnterpriseApiExecutionMode,
  integrationPipelineModeFor,
  composeEnterpriseExecution,
  resetEnterpriseApiRuntimeForTests,
  bootstrapEnterpriseApiRuntime,
} from "../../../src/platform/api/runtime";
import { setupIntelligenceOsIntegration } from "../../../src/platform/intelligence/integration/testing";
import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";
import { asOrganizationId, asWorkspaceId } from "../../../src/platform/intelligence/shared/identifiers";
import { IntegrationLayerJobExecutor } from "../../../src/platform/infrastructure/execution/workers/job-executors";
import { createDistributedExecutionPlatform } from "../../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";
import { failure, success } from "../../../src/platform/intelligence/shared/result";
import type { IProviderDispatcher } from "../../../src/platform/intelligence/providers/runtime/interfaces/provider-dispatcher";
import type {
  ProviderExecutionRequest,
} from "../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-response";
import type { CancellationToken } from "../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import type { StreamingChunk } from "../../../src/platform/intelligence/providers/runtime/contracts/streaming";
import type { Result } from "../../../src/platform/intelligence/shared/result";
import { asProviderId } from "../../../src/platform/intelligence/shared/identifiers";

describe("M9.2D2 execution modes", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("defaults to STUB when no env flags set", () => {
    expect(
      parseEnterpriseApiExecutionModeFromEnv({
        ...process.env,
        ENTERPRISE_API_EXECUTION_MODE: undefined,
        ENTERPRISE_API_USE_INTEGRATION_LAYER: undefined,
      })
    ).toBe("stub");
  });

  it("maps legacy USE_INTEGRATION_LAYER to simulated", () => {
    expect(
      parseEnterpriseApiExecutionModeFromEnv({
        ...process.env,
        ENTERPRISE_API_EXECUTION_MODE: undefined,
        ENTERPRISE_API_USE_INTEGRATION_LAYER: "true",
      })
    ).toBe("simulated");
  });

  it("rejects LIVE without OPENAI_API_KEY at validation", () => {
    expect(() =>
      validateEnterpriseApiExecutionConfig("live", {
        ...process.env,
        OPENAI_API_KEY: "",
      })
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects invalid execution mode env", () => {
    expect(() =>
      parseEnterpriseApiExecutionModeFromEnv({
        ...process.env,
        ENTERPRISE_API_EXECUTION_MODE: "banana",
      })
    ).toThrow(/Invalid ENTERPRISE_API_EXECUTION_MODE/);
  });

  it("uses full pipeline for simulated and live (stub stays planning-only)", () => {
    expect(integrationPipelineModeFor("stub")).toBe("planning_through_routing");
    expect(integrationPipelineModeFor("simulated")).toBe("full");
    expect(integrationPipelineModeFor("live")).toBe("full");
  });

  it("sync bootstrap throws for LIVE mode", () => {
    expect(() =>
      bootstrapEnterpriseApiRuntime({
        executionMode: "live",
      })
    ).toThrow(/bootstrapEnterpriseApiRuntimeAsync|OPENAI_API_KEY/);
  });
});

describe("M9.2D2 provider call guards", () => {
  function runWithDispatcher(
    dispatcher: ControllableDispatcher,
    mode: "simulated" | "live",
    integrationMode: "full" | "planning_through_routing"
  ) {
    const integration = setupIntelligenceOsIntegration({
      runtimeDispatcher: dispatcher,
    }).engine;
    const executor = new IntegrationLayerJobExecutor(integration, {
      executionMode: mode,
      integrationMode,
    });
    const distributed = createDistributedExecutionPlatform({ executor }).engine;
    return distributed.enqueue({
      payload: {
        rawPrompt: "Write short campaign copy.",
        organizationId: "org_d2",
        workspaceId: "ws_d2",
        correlationId: "corr_d2",
        metadata: {
          userId: "user_d2",
          brandId: "brand_d2",
          projectId: "proj_d2",
          integrationMode,
        },
      },
      queueKind: "immediate",
    });
  }

  it("STUB mode has zero provider dispatch attempts", async () => {
    const dispatcher = new ControllableDispatcher();
    const stub = composeEnterpriseExecution({ executionMode: "stub" });
    expect(stub.executor).toBeDefined();
    expect(dispatcher.attempts).toBe(0);
  });

  it("SIMULATED mode dispatches ControllableDispatcher (zero external network)", async () => {
    const dispatcher = new ControllableDispatcher();
    const distributed = createDistributedExecutionPlatform({
      executor: new IntegrationLayerJobExecutor(
        setupIntelligenceOsIntegration({
          runtimeDispatcher: dispatcher,
        }).engine,
        { executionMode: "simulated", integrationMode: "full" }
      ),
    }).engine;
    const enq = await distributed.enqueue({
      payload: {
        rawPrompt: "Write short campaign copy.",
        organizationId: "org_1",
        workspaceId: "ws_1",
        capabilityHint: "text.generate",
        metadata: {
          userId: "ios_test_user",
          brandId: "brand_org_1",
          integrationMode: "full",
          capabilityHint: "text.generate",
          capabilityId: "text.generate",
        },
      },
      queueKind: "immediate",
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    distributed.registerWorker("execution", 1);
    await distributed.tick(1);
    expect(dispatcher.attempts).toBeGreaterThan(0);
    const job = distributed.getJob(enq.value.jobId);
    expect(job.ok).toBe(true);
    if (!job.ok || !job.value?.resultSummary) return;
    expect(job.value.resultSummary.providerMode).toBe("simulated");
    expect(typeof job.value.resultSummary.resultText).toBe("string");
  }, 60000);

  it("LIVE mocked mode dispatches through provider abstraction", async () => {
    const dispatcher = new ControllableDispatcher();
    const distributed = createDistributedExecutionPlatform({
      executor: new IntegrationLayerJobExecutor(
        setupIntelligenceOsIntegration({
          runtimeDispatcher: dispatcher,
        }).engine,
        { executionMode: "live", integrationMode: "full" }
      ),
    }).engine;
    const enq = await distributed.enqueue({
      payload: {
        rawPrompt: "Return exactly the word READY.",
        organizationId: "org_1",
        workspaceId: "ws_1",
        capabilityHint: "text.generate",
        metadata: {
          userId: "ios_test_user",
          brandId: "brand_org_1",
          integrationMode: "full",
          capabilityHint: "text.generate",
          capabilityId: "text.generate",
        },
      },
      queueKind: "immediate",
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    distributed.registerWorker("execution", 1);
    await distributed.tick(1);
    expect(dispatcher.attempts).toBeGreaterThan(0);
    const job = distributed.getJob(enq.value.jobId);
    expect(job.ok).toBe(true);
    if (!job.ok || !job.value?.resultSummary) return;
    expect(job.value.resultSummary.providerMode).toBe("live");
    expect(job.value.resultSummary.executionMode).toBe("live");
  }, 120000);
});

class ScriptedProviderDispatcher implements IProviderDispatcher {
  constructor(
    private readonly script: (
      request: ProviderExecutionRequest,
      attempt: number
    ) => Result<ProviderExecutionResponse> | "throw"
  ) {}
  attempts = 0;

  supportsStreaming(): boolean {
    return false;
  }

  getLastArtifacts(): Readonly<Record<string, unknown>> {
    return {};
  }

  lastRequest?: ProviderExecutionRequest;

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this.attempts += 1;
    this.lastRequest = request;
    const outcome = this.script(request, this.attempts);
    if (outcome === "throw") {
      throw new Error("network error");
    }
    return outcome;
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<Result<ProviderExecutionResponse>> {
    return this.dispatch(request, token);
  }
}

describe("M9.2D2 provider failure handling", () => {
  async function runScripted(script: ScriptedProviderDispatcher["script"]) {
    const dispatcher = new ScriptedProviderDispatcher(script);
    const integration = setupIntelligenceOsIntegration({
      runtimeDispatcher: dispatcher,
    }).engine;
    return integration.run({
      requestId: "fail_req",
      rawPrompt: "test failure path",
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      mode: "full",
      metadata: { userId: "ios_test_user", brandId: "brand_org_1" },
    });
  }

  it("auth failure does not return fake success", async () => {
    const result = await runScripted(() =>
      failure({
        code: "AUTH_ERROR",
        message: "invalid api key",
        name: "ProviderError",
      } as never)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
  }, 60000);

  it("records routed provider on successful mocked dispatch", async () => {
    const dispatcher = new ScriptedProviderDispatcher(() =>
      success({
        requestId: "r1",
        providerId: asProviderId("openai"),
        output: { message: "READY" },
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        streamed: false,
        finishedAt: new Date().toISOString(),
      })
    );
    const integration = setupIntelligenceOsIntegration({
      runtimeDispatcher: dispatcher,
    }).engine;
    const result = await integration.run({
      requestId: "route_req",
      rawPrompt: "Return READY",
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      mode: "full",
      metadata: {
        userId: "ios_test_user",
        brandId: "brand_org_1",
        capabilityHint: "text.generate",
        capabilityId: "text.generate",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dispatcher.lastRequest?.providerId).toBeDefined();
    expect(result.value.artifacts.runtime?.response?.output).toBeDefined();
  }, 120000);
});

const liveSmokeEnabled =
  process.env.OPENAI_API_KEY?.trim() &&
  process.env.RUN_LIVE_PROVIDER_SMOKE === "true";

(liveSmokeEnabled ? describe : describe.skip)(
  "M9.2D2 real OpenAI smoke (opt-in)",
  () => {
    it("runs one minimal LIVE provider call through Integration OS", async () => {
      const { bootstrapEnterpriseApiRuntimeAsync } = await import(
        "../../../src/platform/api/runtime"
      );
      resetEnterpriseApiRuntimeForTests();
      const runtime = await bootstrapEnterpriseApiRuntimeAsync({
        executionMode: "live",
        seedDemoTenant: true,
      });
      const orgId = runtime.platform.seed?.organizationId ?? "org_production";
      const principal = {
        userId: runtime.platform.seed?.userId ?? "user_production",
        organizationId: orgId,
        roles: ["owner"] as const,
        workspaceId: runtime.platform.seed?.workspaceId,
      };
      const created = await runtime.platform.executions.create(
        {
          prompt: "Return exactly the word READY.",
          organizationId: orgId,
        },
        principal
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.status).toBe("succeeded");
      const diag = runtime.platform.executions.diagnostics(
        created.value.executionId,
        { organizationId: orgId, userId: principal.userId }
      );
      expect(diag.ok).toBe(true);
      if (!diag.ok) return;
      expect(diag.value.providerMode).toBe("live");
    }, 180000);
  }
);
