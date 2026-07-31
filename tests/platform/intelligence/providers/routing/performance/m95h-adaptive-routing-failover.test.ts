/**
 * M9.5H — Adaptive Routing, Failover & Evaluation Feedback offline certification.
 * ZERO network. ZERO live/paid provider calls.
 */

import { createProviderRuntime } from "../../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-response";
import type { CancellationToken } from "../../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { sampleRequest } from "../../../../../../src/platform/intelligence/providers/runtime/testing";
import { success, failure, type Result } from "../../../../../../src/platform/intelligence/shared/result";
import { ProviderError } from "../../../../../../src/platform/intelligence/shared/errors";
import {
  asCapabilityId,
  asProviderId,
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../../../../../src/platform/intelligence/shared/identifiers";
import type { IProviderDispatcher } from "../../../../../../src/platform/intelligence/providers/runtime/interfaces/provider-dispatcher";
import { CircuitBreakerRegistry } from "../../../../../../src/platform/intelligence/providers/runtime/circuit-breaker/circuit-breaker";
import { FailoverOrchestrator } from "../../../../../../src/platform/intelligence/providers/routing/performance/failover/failover-orchestrator";
import {
  classifyExecutionFailure,
  shouldFailover,
} from "../../../../../../src/platform/intelligence/providers/routing/performance/failover/failure-classification";
import { InMemoryModelPerformanceStore } from "../../../../../../src/platform/intelligence/providers/routing/performance/stores/in-memory-model-performance-store";
import { ModelPerformanceIntelligence } from "../../../../../../src/platform/intelligence/providers/routing/performance/intelligence/model-performance-intelligence";
import { loadAdaptiveRoutingConfig } from "../../../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";
import { createRoutingPlatform } from "../../../../../../src/platform/intelligence/providers/routing/factories/create-routing-platform";
import {
  makeCandidate,
  makeRoutingRequest,
} from "../../../../../../src/platform/intelligence/providers/routing/testing";
import { asRoutingDecisionId, asRoutingPlanId } from "../../../../../../src/platform/intelligence/providers/routing/contracts/identifiers";
import type { RoutingDecision } from "../../../../../../src/platform/intelligence/providers/routing/contracts/plan";
import type { PerformanceEvidence } from "../../../../../../src/platform/intelligence/providers/routing/performance/contracts/performance-evidence";
import { PerformanceEvidenceWriter } from "../../../../../../src/platform/intelligence/providers/routing/performance/feedback/performance-evidence-writer";
import { InMemoryProviderOperationStore } from "../../../../../../src/platform/intelligence/providers/async/store/in-memory-provider-operation-store";
import { AsyncFailoverOrchestrator } from "../../../../../../src/platform/intelligence/providers/routing/performance/failover/async-failover-orchestrator";
import { loadProviderFailoverConfig } from "../../../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";
import { EMPTY_EXECUTION_STATISTICS } from "../../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-metadata";

class ScriptedMultiProviderDispatcher implements IProviderDispatcher {
  readonly calls: string[] = [];

  constructor(
    private readonly scripts: Record<
      string,
      "success" | "rate_limit" | "timeout" | "invalid_request" | "unavailable"
    >
  ) {}

  supportsStreaming(): boolean {
    return false;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const pid = String(request.providerId);
    this.calls.push(pid);
    const script = this.scripts[pid] ?? "unavailable";

    if (script === "success") {
      return success({
        requestId: request.requestId,
        providerId: request.providerId,
        output: { text: `ok:${pid}` },
        usage: { totalTokens: 10 },
        providerRequestId: `fake_${pid}`,
        streamed: false,
        finishedAt: new Date().toISOString(),
      });
    }
    if (script === "rate_limit") {
      return failure(new ProviderError("rate_limit exceeded", { requestId: request.requestId }));
    }
    if (script === "timeout") {
      return failure(new ProviderError("execution timed out", { requestId: request.requestId }));
    }
    if (script === "invalid_request") {
      return failure(new ProviderError("invalid request", { requestId: request.requestId }));
    }
    return failure(new ProviderError("provider unavailable", { requestId: request.requestId }));
  }
}

function baseRequest(providerId: string, modelId = "m1"): ProviderExecutionRequest {
  const base = sampleRequest({ requestId: "req_fo", providerId });
  return {
    ...base,
    providerId: asProviderId(providerId),
    modelId,
    capabilityId: asCapabilityId("text.generate"),
    context: {
      ...base.context,
      providerId: asProviderId(providerId),
      executionId: asExecutionId("exec_fo"),
      organizationId: asOrganizationId("org_a"),
      workspaceId: asWorkspaceId("ws_1"),
    },
    retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
  };
}

function decisionFor(
  primary: { providerId: string; modelId: string },
  failovers: { providerId: string; modelId: string }[]
): RoutingDecision {
  const dims = {
    capability: 1,
    health: 1,
    latency: 0.5,
    quality: 0.5,
    cost: 0.5,
    availability: 1,
    preference: 0.5,
    region: 0.5,
    compliance: 1,
    priority: 0.5,
  };
  const score = (providerId: string, modelId: string, total: number) => ({
    providerId: asProviderId(providerId),
    modelId,
    total,
    dimensions: dims,
  });
  const primaryRec = {
    providerId: asProviderId(primary.providerId),
    modelId: primary.modelId,
    score: score(primary.providerId, primary.modelId, 1),
    reason: "primary",
    selected: true,
  };
  const chain = [
    {
      kind: "fallback_chain" as const,
      providerId: asProviderId(primary.providerId),
      modelId: primary.modelId,
      order: 0,
    },
    ...failovers.map((f, i) => ({
      kind: "multi_provider" as const,
      providerId: asProviderId(f.providerId),
      modelId: f.modelId,
      order: i + 1,
    })),
  ];
  return {
    decisionId: asRoutingDecisionId("dec_1"),
    plan: {
      planId: asRoutingPlanId("plan_1"),
      requestId: "req_route",
      capabilityId: asCapabilityId("text.generate"),
      primary: primaryRec,
      fallbacks: failovers.map((f) => ({
        providerId: asProviderId(f.providerId),
        modelId: f.modelId,
        score: score(f.providerId, f.modelId, 0.5),
        reason: "failover",
        selected: false,
      })),
      failoverChain: chain,
      experiments: [],
      statistics: {
        candidatesEvaluated: 1 + failovers.length,
        candidatesFiltered: 0,
        strategy: "balanced",
      },
      createdAt: new Date().toISOString(),
    },
    strategy: "balanced",
    scores: [],
    warnings: [],
    completedAt: new Date().toISOString(),
  };
}

function seedEvidence(
  store: InMemoryModelPerformanceStore,
  rows: Array<{
    org: string;
    providerId: string;
    modelId: string;
    capabilityId: string;
    success: boolean;
    latencyMs: number;
    evaluationScore?: number;
    completedAt: string;
  }>
): Promise<void[]> {
  return Promise.all(
    rows.map(async (r, i) => {
      const e: PerformanceEvidence = {
        evidenceId: `ev_${i}`,
        executionId: `ex_${i}`,
        attemptId: `at_${i}_${r.org}_${r.providerId}`,
        organizationId: r.org,
        capabilityId: r.capabilityId,
        providerId: r.providerId,
        modelId: r.modelId,
        positionInRoute: 0,
        primaryOrFailover: "primary",
        startedAt: r.completedAt,
        completedAt: r.completedAt,
        latencyMs: r.latencyMs,
        success: r.success,
        failureCategory: r.success ? "none" : "unavailable",
        evaluationScore: r.evaluationScore,
        // M9.5P: seeded quality for adaptive tests must be explicit feedback-eligible.
        feedbackEligible: r.evaluationScore != null ? true : undefined,
        evaluationTrust: r.evaluationScore != null ? "medium" : undefined,
        evaluationMethod: r.evaluationScore != null ? "model_judge" : undefined,
        evaluationStatus: r.evaluationScore != null ? "evaluated" : undefined,
        retryCount: 0,
        timeoutOccurred: false,
        rateLimited: false,
        estimatedCost: null,
        recordedAt: r.completedAt,
      };
      await store.recordIdempotent(e);
    })
  );
}

describe("M9.5H failure classification", () => {
  it("failovers recoverable categories and blocks invalid_request", () => {
    expect(shouldFailover(classifyExecutionFailure({ error: { code: "RATE_LIMIT", message: "rate_limit" } }))).toBe(true);
    expect(shouldFailover(classifyExecutionFailure({ error: { code: "TIMEOUT_ERROR", message: "timed out" } }))).toBe(true);
    expect(shouldFailover(classifyExecutionFailure({ error: { code: "VALIDATION_ERROR", message: "invalid request" } }))).toBe(false);
    expect(shouldFailover(classifyExecutionFailure({ message: "circuit breaker is open" }))).toBe(true);
  });
});

describe("M9.5H sync failover certification", () => {
  it("Scenario A: primary succeeds — no failover calls", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "success",
      "provider.anthropic": "success",
      "provider.gemini": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: { ...loadProviderFailoverConfig({ PROVIDER_FAILOVER_ENABLED: "true" }) },
      nowIso: () => new Date().toISOString(),
      nowMs: () => Date.now(),
      createId: (p) => `${p}_a`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai", "gpt"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [
          { providerId: "provider.anthropic", modelId: "claude" },
          { providerId: "provider.gemini", modelId: "gemini" },
        ]
      )
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(dispatcher.calls).toEqual(["provider.openai"]);
    expect(out.value.finalProviderId).toBe("provider.openai");
    expect(out.value.attempts).toHaveLength(1);
  });

  it("Scenario B: primary rate-limited → failover succeeds", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "rate_limit",
      "provider.anthropic": "success",
      "provider.gemini": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({ PROVIDER_FAILOVER_ENABLED: "true" }),
      createId: (p) => `${p}_b`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai", "gpt"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [
          { providerId: "provider.anthropic", modelId: "claude" },
          { providerId: "provider.gemini", modelId: "gemini" },
        ]
      )
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(dispatcher.calls).toEqual(["provider.openai", "provider.anthropic"]);
    expect(dispatcher.calls).not.toContain("provider.gemini");
    expect(out.value.finalProviderId).toBe("provider.anthropic");
    expect(out.value.attempts[0].failureCategory).toBe("rate_limit");
    expect(out.value.result.success).toBe(true);
  });

  it("Scenario C: primary timeout → failover succeeds", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "timeout",
      "provider.anthropic": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({}),
      createId: (p) => `${p}_c`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [{ providerId: "provider.anthropic", modelId: "claude" }]
      )
    );
    expect(out.ok && out.value.finalProviderId === "provider.anthropic").toBe(true);
  });

  it("Scenario D: invalid request → NO failover", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "invalid_request",
      "provider.anthropic": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({}),
      createId: (p) => `${p}_d`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [{ providerId: "provider.anthropic", modelId: "claude" }]
      )
    );
    expect(dispatcher.calls).toEqual(["provider.openai"]);
    expect(out.ok && out.value.result.success).toBe(false);
  });

  it("Scenario E: all providers fail", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "unavailable",
      "provider.anthropic": "unavailable",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({}),
      createId: (p) => `${p}_e`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [{ providerId: "provider.anthropic", modelId: "claude" }]
      )
    );
    expect(out.ok && out.value.result.success).toBe(false);
    expect(dispatcher.calls).toEqual(["provider.openai", "provider.anthropic"]);
  });

  it("Scenario F: failover budget exhausted", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "unavailable",
      "provider.anthropic": "unavailable",
      "provider.gemini": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const orch = new FailoverOrchestrator({
      runtime,
      failover: {
        ...loadProviderFailoverConfig({}),
        maxProviderAttempts: 2,
        maxFailovers: 1,
      },
      createId: (p) => `${p}_f`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [
          { providerId: "provider.anthropic", modelId: "claude" },
          { providerId: "provider.gemini", modelId: "gemini" },
        ]
      )
    );
    expect(dispatcher.calls).not.toContain("provider.gemini");
    expect(out.ok && out.value.budgetExhausted).toBe(true);
  });

  it("Scenario G: circuit-open primary excluded before execution", async () => {
    const dispatcher = new ScriptedMultiProviderDispatcher({
      "provider.openai": "success",
      "provider.anthropic": "success",
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const breakers = new CircuitBreakerRegistry({
      failureThreshold: 1,
      successThreshold: 1,
      resetTimeoutMs: 60_000,
    });
    // Trip openai breaker
    const b = breakers.forProvider(asProviderId("provider.openai"));
    b.recordFailure();
    expect(b.canDispatch()).toBe(false);

    const orch = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({}),
      circuitBreakers: breakers,
      createId: (p) => `${p}_g`,
    });
    const out = await orch.execute(
      baseRequest("provider.openai"),
      decisionFor(
        { providerId: "provider.openai", modelId: "gpt" },
        [{ providerId: "provider.anthropic", modelId: "claude" }]
      )
    );
    expect(dispatcher.calls).toEqual(["provider.anthropic"]);
    expect(out.ok && out.value.finalProviderId).toBe("provider.anthropic");
    expect(out.ok && out.value.attempts[0].failureCategory).toBe("circuit_open");
  });
});

describe("M9.5H adaptive routing certification", () => {
  it("quality-first prefers high quality; latency-first prefers low latency", async () => {
    const store = new InMemoryModelPerformanceStore();
    const now = Date.now();
    const rows: Parameters<typeof seedEvidence>[1] = [];
    for (let i = 0; i < 40; i++) {
      rows.push({
        org: "org_global",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 4000,
        evaluationScore: 0.93,
        completedAt: new Date(now - i * 60_000).toISOString(),
      });
      rows.push({
        org: "org_global",
        providerId: "provider.b",
        modelId: "model-b",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 200,
        evaluationScore: 0.89,
        completedAt: new Date(now - i * 60_000).toISOString(),
      });
    }
    await seedEvidence(store, rows);

    const platform = createRoutingPlatform({
      performanceStore: store,
      env: {
        ADAPTIVE_ROUTING_ENABLED: "true",
        ADAPTIVE_ROUTING_MIN_SAMPLES: "20",
        ADAPTIVE_ROUTING_FEEDBACK_WEIGHT: "0.4",
        ADAPTIVE_ROUTING_TENANT_OVERLAY: "false",
      },
      createId: (p) => `${p}_adapt`,
    });

    const candidates = [
      makeCandidate({
        providerId: asProviderId("provider.a"),
        modelId: "model-a",
        vendor: "a",
        qualityScore: 0.7,
        estimatedLatencyMs: 3000,
      }),
      makeCandidate({
        providerId: asProviderId("provider.b"),
        modelId: "model-b",
        vendor: "b",
        qualityScore: 0.7,
        estimatedLatencyMs: 3000,
      }),
    ];

    const qualityReq = {
      ...makeRoutingRequest(candidates),
      strategy: "highest_quality" as const,
      metadata: { organizationId: "org_global" },
    };
    const quality = await platform.engine.route(qualityReq);
    expect(quality.ok).toBe(true);
    if (quality.ok) {
      expect(String(quality.value.plan.primary.providerId)).toBe("provider.a");
    }

    const latencyReq = {
      ...makeRoutingRequest(candidates),
      strategy: "lowest_latency" as const,
      metadata: { organizationId: "org_global" },
    };
    const latency = await platform.engine.route(latencyReq);
    expect(latency.ok).toBe(true);
    if (latency.ok) {
      expect(String(latency.value.plan.primary.providerId)).toBe("provider.b");
    }
  });

  it("cold start keeps static ranking when samples < min", async () => {
    const store = new InMemoryModelPerformanceStore();
    await seedEvidence(store, [
      {
        org: "org_x",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.99,
        completedAt: new Date().toISOString(),
      },
    ]);
    const intel = new ModelPerformanceIntelligence(
      store,
      loadAdaptiveRoutingConfig({
        ADAPTIVE_ROUTING_ENABLED: "true",
        ADAPTIVE_ROUTING_MIN_SAMPLES: "20",
      })
    );
    const blended = await intel.blendScore({
      staticTotal: 0.8,
      staticQuality: 0.8,
      staticLatency: 0.5,
      staticCost: 0.5,
      staticHealth: 1,
      strategy: "balanced",
      key: {
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
      },
    });
    expect(blended.explain.coldStart).toBe(true);
    expect(blended.explain.usedAdaptiveFeedback).toBe(false);
    expect(blended.total).toBe(0.8);
  });

  it("ADAPTIVE_ROUTING_ENABLED=false preserves static scores", async () => {
    const store = new InMemoryModelPerformanceStore();
    const rows: Parameters<typeof seedEvidence>[1] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({
        org: "org_g",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
        success: false,
        latencyMs: 9000,
        completedAt: new Date().toISOString(),
      });
    }
    await seedEvidence(store, rows);
    const intel = new ModelPerformanceIntelligence(
      store,
      loadAdaptiveRoutingConfig({ ADAPTIVE_ROUTING_ENABLED: "false", ADAPTIVE_ROUTING_MIN_SAMPLES: "5" })
    );
    const blended = await intel.blendScore({
      staticTotal: 0.9,
      staticQuality: 0.9,
      staticLatency: 0.9,
      staticCost: 0.9,
      staticHealth: 1,
      strategy: "balanced",
      key: { providerId: "provider.a", modelId: "model-a", capabilityId: "text.generate" },
    });
    expect(blended.total).toBe(0.9);
    expect(blended.explain.usedAdaptiveFeedback).toBe(false);
  });

  it("tenant overlays do not leak across organizations", async () => {
    const store = new InMemoryModelPerformanceStore();
    const rows: Parameters<typeof seedEvidence>[1] = [];
    for (let i = 0; i < 25; i++) {
      // Tenant A: A excellent, B weak
      rows.push({
        org: "tenant_a",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.95,
        completedAt: new Date().toISOString(),
      });
      rows.push({
        org: "tenant_a",
        providerId: "provider.b",
        modelId: "model-b",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.4,
        completedAt: new Date().toISOString(),
      });
      // Tenant B: B excellent, A weak
      rows.push({
        org: "tenant_b",
        providerId: "provider.b",
        modelId: "model-b",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.95,
        completedAt: new Date().toISOString(),
      });
      rows.push({
        org: "tenant_b",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "text.generate",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.4,
        completedAt: new Date().toISOString(),
      });
    }
    await seedEvidence(store, rows);

    const aOnly = await store.query({ organizationId: "tenant_a", limit: 1000 });
    expect(aOnly.every((e) => e.organizationId === "tenant_a")).toBe(true);
    expect(aOnly.some((e) => e.organizationId === "tenant_b")).toBe(false);

    const unscoped = await store.query({ providerId: "provider.a" });
    expect(unscoped).toHaveLength(0);

    const platform = createRoutingPlatform({
      performanceStore: store,
      env: {
        ADAPTIVE_ROUTING_ENABLED: "true",
        ADAPTIVE_ROUTING_MIN_SAMPLES: "20",
        ADAPTIVE_ROUTING_FEEDBACK_WEIGHT: "0.45",
        ADAPTIVE_ROUTING_TENANT_OVERLAY: "true",
      },
    });
    const candidates = [
      makeCandidate({
        providerId: asProviderId("provider.a"),
        modelId: "model-a",
        vendor: "a",
        qualityScore: 0.5,
      }),
      makeCandidate({
        providerId: asProviderId("provider.b"),
        modelId: "model-b",
        vendor: "b",
        qualityScore: 0.5,
      }),
    ];
    const forA = await platform.engine.route({
      ...makeRoutingRequest(candidates),
      strategy: "highest_quality",
      preferences: { tenantId: asOrganizationId("tenant_a") },
    });
    const forB = await platform.engine.route({
      ...makeRoutingRequest(candidates),
      strategy: "highest_quality",
      preferences: { tenantId: asOrganizationId("tenant_b") },
    });
    expect(forA.ok && String(forA.value.plan.primary.providerId)).toBe("provider.a");
    expect(forB.ok && String(forB.value.plan.primary.providerId)).toBe("provider.b");
  });

  it("restart-safe: aggregates identical from durable in-memory store", async () => {
    const store = new InMemoryModelPerformanceStore();
    await seedEvidence(store, [
      ...Array.from({ length: 25 }, (_, i) => ({
        org: "org_r",
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "vision.analyze",
        success: true,
        latencyMs: 100,
        evaluationScore: 0.9,
        completedAt: new Date(Date.now() - i * 1000).toISOString(),
      })),
    ]);
    const cfg = loadAdaptiveRoutingConfig({
      ADAPTIVE_ROUTING_ENABLED: "true",
      ADAPTIVE_ROUTING_MIN_SAMPLES: "10",
    });
    const before = await new ModelPerformanceIntelligence(store, cfg).blendScore({
      staticTotal: 0.5,
      staticQuality: 0.5,
      staticLatency: 0.5,
      staticCost: 0.5,
      staticHealth: 1,
      strategy: "highest_quality",
      key: {
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "vision.analyze",
        organizationId: "org_r",
      },
    });
    // Simulate "restart" by constructing a new intelligence over the same store.
    const after = await new ModelPerformanceIntelligence(store, cfg).blendScore({
      staticTotal: 0.5,
      staticQuality: 0.5,
      staticLatency: 0.5,
      staticCost: 0.5,
      staticHealth: 1,
      strategy: "highest_quality",
      key: {
        providerId: "provider.a",
        modelId: "model-a",
        capabilityId: "vision.analyze",
        organizationId: "org_r",
      },
    });
    expect(after.total).toBe(before.total);
    expect(after.explain.sampleCount).toBe(before.explain.sampleCount);
  });

  it("multi-instance: idempotent attempt identity", async () => {
    const store = new InMemoryModelPerformanceStore();
    const evidence: PerformanceEvidence = {
      evidenceId: "ev_dup",
      executionId: "ex_dup",
      attemptId: "attempt_shared",
      organizationId: "org_m",
      capabilityId: "image.generate",
      providerId: "provider.x",
      modelId: "model-x",
      positionInRoute: 0,
      primaryOrFailover: "primary",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs: 10,
      success: true,
      failureCategory: "none",
      retryCount: 0,
      timeoutOccurred: false,
      rateLimited: false,
      recordedAt: new Date().toISOString(),
    };
    const a = await store.recordIdempotent(evidence);
    const b = await store.recordIdempotent({ ...evidence, evidenceId: "ev_dup_2" });
    expect(a).toBe("inserted");
    expect(b).toBe("duplicate");
    expect(store.size()).toBe(1);
  });

  it("modality-neutral keys for text/vision/image/video", async () => {
    const store = new InMemoryModelPerformanceStore();
    for (const cap of ["text.generate", "vision.analyze", "image.generate", "video.generate"]) {
      await seedEvidence(store, [
        ...Array.from({ length: 22 }, (_, i) => ({
          org: "org_mod",
          providerId: "provider.m",
          modelId: `model-${cap}`,
          capabilityId: cap,
          success: true,
          latencyMs: 50,
          evaluationScore: cap === "video.generate" ? undefined : 0.8,
          completedAt: new Date().toISOString(),
        })),
      ]);
    }
    const text = await store.query({
      organizationId: "org_mod",
      capabilityId: "text.generate",
    });
    const video = await store.query({
      organizationId: "org_mod",
      capabilityId: "video.generate",
    });
    expect(text.length).toBeGreaterThanOrEqual(20);
    expect(video.every((e) => e.evaluationScore === undefined)).toBe(true);
  });
});

describe("M9.5H evidence writer + async failover guards", () => {
  it("records attempt history without inventing cost", async () => {
    const store = new InMemoryModelPerformanceStore();
    const writer = new PerformanceEvidenceWriter(store);
    await writer.recordAttempt(
      {
        attemptId: "att_1",
        positionInRoute: 0,
        primaryOrFailover: "primary",
        providerId: "provider.openai",
        modelId: "gpt",
        success: true,
        failureCategory: "none",
        latencyMs: 12,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
      },
      {
        requestId: "r1",
        sessionId: "s1",
        status: "completed",
        success: true,
        response: {
          requestId: "r1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { totalTokens: 5 },
          streamed: false,
          finishedAt: new Date().toISOString(),
        },
        statistics: {
          ...EMPTY_EXECUTION_STATISTICS,
          dispatchMs: 1,
          totalMs: 12,
          attempts: 1,
        },
        completedAt: new Date().toISOString(),
      },
      {
        executionId: "ex1",
        organizationId: "org1",
        capabilityId: "text.generate",
        createId: (p) => `${p}_w`,
        nowIso: () => new Date().toISOString(),
      }
    );
    const rows = await store.query({ organizationId: "org1" });
    expect(rows[0].estimatedCost).toBeNull();
    expect(rows[0].totalTokens).toBe(5);
  });

  it("async failover never submits while still processing", async () => {
    const opStore = new InMemoryProviderOperationStore();
    const now = new Date().toISOString();
    await opStore.create({
      operationId: "op1",
      executionId: "ex_async",
      attemptId: "a1",
      organizationId: "org1",
      workspaceId: "ws1",
      providerId: "provider.runway",
      modelId: "gen4.5",
      capabilityId: "video.generate",
      submissionKey: "sk1",
      state: "pending",
      idempotencyKey: "idem1",
      pollCount: 1,
      providerJobId: "job1",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      safeMetadata: {
        failoverChain: [{ providerId: "provider.luma", modelId: "ray-2" }],
      },
    });

    let submits = 0;
    const fo = new AsyncFailoverOrchestrator({
      submitFailover: async () => {
        submits += 1;
        return success({ operationId: "op2", providerJobId: "job2" });
      },
      store: opStore,
      failover: loadProviderFailoverConfig({}),
      nowIso: () => now,
      createId: (p) => `${p}_af`,
    });
    const res = await fo.maybeFailover({
      executionId: "ex_async",
      organizationId: "org1",
      prompt: "x",
      correlationId: "c",
      capabilityId: "video.generate",
      failoverChain: [{ providerId: "provider.luma", modelId: "ray-2" }],
    });
    expect(res.ok && res.value.submitted).toBe(false);
    expect(res.ok && res.value.reason).toBe("still_processing");
    expect(submits).toBe(0);
  });

  it("async failover submits next provider after terminal failure", async () => {
    const opStore = new InMemoryProviderOperationStore();
    const now = new Date().toISOString();
    await opStore.create({
      operationId: "op1",
      executionId: "ex_async2",
      attemptId: "a1",
      organizationId: "org1",
      workspaceId: "ws1",
      providerId: "provider.runway",
      modelId: "gen4.5",
      capabilityId: "video.generate",
      submissionKey: "sk2",
      state: "failed",
      idempotencyKey: "idem2",
      pollCount: 2,
      providerJobId: "job1",
      submittedAt: now,
      terminalAt: now,
      errorCode: "PROVIDER_INTERNAL",
      errorMessage: "provider internal",
      createdAt: now,
      updatedAt: now,
      safeMetadata: {
        failoverChain: [{ providerId: "provider.luma", modelId: "ray-2" }],
      },
    });

    let submits = 0;
    const fo = new AsyncFailoverOrchestrator({
      submitFailover: async (input: { providerId: string }) => {
        submits += 1;
        expect(input.providerId).toBe("provider.luma");
        return success({ operationId: "op2", providerJobId: "job2" });
      },
      store: opStore,
      failover: loadProviderFailoverConfig({ PROVIDER_FAILOVER_MAX_SUBMITTED_PAID_JOBS: "2" }),
      nowIso: () => now,
      createId: (p) => `${p}_af2`,
    });
    const res = await fo.maybeFailover({
      executionId: "ex_async2",
      organizationId: "org1",
      prompt: "x",
      correlationId: "c",
      capabilityId: "video.generate",
      failoverChain: [{ providerId: "provider.luma", modelId: "ray-2" }],
    });
    expect(res.ok && res.value.submitted).toBe(true);
    expect(submits).toBe(1);
  });
});

describe("M9.5H provider bypass audit (static)", () => {
  it("FailoverOrchestrator is the sync failover execution path", () => {
    expect(typeof FailoverOrchestrator.prototype.execute).toBe("function");
    expect(typeof AsyncFailoverOrchestrator.prototype.maybeFailover).toBe("function");
  });
});
