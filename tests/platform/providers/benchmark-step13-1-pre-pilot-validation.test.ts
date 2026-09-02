/**
 * Step 13.1 + Real-Model Pre-Pilot Validation — deterministic tests (zero paid API calls).
 */

import {
  STAGE1_REAL_VALIDATION_BENCHMARK_IDS,
  STAGE1_REAL_VALIDATION_MODELS,
  STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  STAGE1_REAL_VALIDATION_BUDGET,
  stage1RealValidationCellCount,
  planBenchmarkInvocations,
  assertBenchmarkBudget,
  runBenchmark,
  getBenchmarkCase,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  createBenchmarkProviderExecutor,
  resolveBenchmarkValidationAsync,
  InMemoryRoutingPolicyStore,
  InMemoryPromotionCandidateStore,
  createPromotionGovernanceService,
  createRoutingPolicyService,
  composeAdaptiveRoutingPlatform,
  bootstrapAdaptiveRoutingAtStartup,
  resolveAdaptiveRoutingDecision,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import {
  logBenchmarkRealExecutionSummary,
  buildBenchmarkPipelineVerification,
} from "../../../src/platform/providers/routing/performance/benchmark/reporting/benchmark-evaluation-logger";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
  runEnterpriseAdaptiveRoutingStartupValidation,
} from "../../../src/platform/api/runtime";
import { getSharedTestDurableStores, resetSharedTestDurableStores } from "../../../src/platform/infrastructure/durability";
import { createModelRegistryPlatform } from "../../../src/platform/model-registry/factories/create-model-registry-platform";
import { DefaultCompatibilityEngine } from "../../../src/platform/model-registry/compatibility/default-compatibility-engine";
import { InMemoryProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import { asProviderId } from "../../../src/platform/core/identifiers";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { buildModelPerformanceRecord } from "../../../src/platform/providers/routing/performance/benchmark/engine/record-builder";
import type { ShadowDecision } from "../../../src/platform/providers/routing/performance/benchmark/shadow/shadow-decision-contract";

describe("Step 13.1 + Real-Model Pre-Pilot Validation", () => {
  beforeEach(() => {
    clearValidationCache();
    resetEnterpriseApiRuntimeForTests();
    resetSharedTestDurableStores();
  });

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("plans exactly four benchmark cells for Stage 1 real validation", () => {
    expect(stage1RealValidationCellCount()).toBe(4);
    const plan = planBenchmarkInvocations({
      benchmarkIds: [...STAGE1_REAL_VALIDATION_BENCHMARK_IDS],
      models: STAGE1_REAL_VALIDATION_MODELS,
      repeatCount: 1,
      budget: STAGE1_REAL_VALIDATION_BUDGET,
    });
    expect(plan.totalInvocations).toBe(4);
    expect(plan.benchmarkCount).toBe(2);
    expect(plan.modelCount).toBe(2);
  });

  it("aborts when budget exceeds four invocations", () => {
    const plan = planBenchmarkInvocations({
      benchmarkIds: [...STAGE1_REAL_VALIDATION_BENCHMARK_IDS, "bench.social.copywriting"],
      models: STAGE1_REAL_VALIDATION_MODELS,
      repeatCount: 1,
    });
    expect(() => assertBenchmarkBudget(plan, STAGE1_REAL_VALIDATION_BUDGET)).toThrow(
      /budget exceeded/i,
    );
  });

  it("does not invoke providers during Stage 1 planning", () => {
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
    planBenchmarkInvocations({
      benchmarkIds: [...STAGE1_REAL_VALIDATION_BENCHMARK_IDS],
      models: STAGE1_REAL_VALIDATION_MODELS,
      repeatCount: 1,
      budget: STAGE1_REAL_VALIDATION_BUDGET,
    });
    assertBenchmarkBudget(
      planBenchmarkInvocations({
        benchmarkIds: [...STAGE1_REAL_VALIDATION_BENCHMARK_IDS],
        models: STAGE1_REAL_VALIDATION_MODELS,
        repeatCount: 1,
        budget: STAGE1_REAL_VALIDATION_BUDGET,
      }),
      STAGE1_REAL_VALIDATION_BUDGET,
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("enterprise boot composition exposes adaptive routing platform", () => {
    const platform = createEnterpriseApiPlatform({ executionMode: "simulated" });
    expect(platform.adaptiveRoutingPlatform).toBeDefined();
    expect(platform.modelRegistry).toBeDefined();
    expect(platform.compatibilityEngine).toBeDefined();
  });

  it("startup validation runs when durable stores are enabled", async () => {
    const stores = getSharedTestDurableStores();
    const platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      durableStores: stores,
    });
    const result = await runEnterpriseAdaptiveRoutingStartupValidation(platform);
    expect(result.ran).toBe(true);
    expect(result.invalidCount).toBe(0);
  });

  it("startup validation skips when non-durable runtime", async () => {
    const platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      durableStores: undefined,
    });
    const result = await runEnterpriseAdaptiveRoutingStartupValidation(platform);
    expect(result.ran).toBe(false);
    expect(result.reason).toBe("non_durable_runtime");
  });

  it("invalid startup policy fails closed and is paused", async () => {
    const stores = getSharedTestDurableStores();
    const providerRegistry = new InMemoryProviderRuntimeRegistry();
    providerRegistry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: new ControllableDispatcher(),
      status: "available",
      capabilities: ["text.generate"],
    });
    const modelPlatform = createModelRegistryPlatform({ loadSeed: true });
    const compatibilityEngine = new DefaultCompatibilityEngine();
    const policyStore = new InMemoryRoutingPolicyStore();
    const promotionStore = new InMemoryPromotionCandidateStore();

    const governance = createPromotionGovernanceService({ store: promotionStore });
    const policies = createRoutingPolicyService({ store: policyStore });
    const shadowDecision = Object.freeze({
      shadowDecisionId: "shadow_boot",
      productionExecutionId: "exec_boot",
      status: "SHADOW_RECOMMENDATION" as const,
      actual: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        strategyId: "strategy.baseline",
      }),
      recommended: Object.freeze({
        providerId: "provider.anthropic",
        modelId: "anthropic/claude-sonnet-4-5",
        strategyId: "strategy.quality_first",
      }),
      recommendationScope: "social",
      evidenceCount: 1,
      validComparisonSamples: 1,
      confidenceTier: "low" as const,
      evidenceTier: "LOW" as const,
      compatibilityStatus: "COMPARABLE" as const,
      recommendationReason: "test",
      limitations: Object.freeze([]),
      decisionTimestamp: "2026-01-01T00:00:00.000Z",
      promotionReadiness: "READY_FOR_REVIEW" as const,
    }) satisfies ShadowDecision;

    const candidate = await governance.registerFromShadowDecision({
      shadowDecision,
      scope: Object.freeze({ service: "social", subtype: "copywriting", industry: "fashion" }),
      createId: (p) => `${p}_boot`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    await governance.submitForReview(candidate.candidateId);
    const approved = await governance.approveCandidate({
      candidateId: candidate.candidateId,
      approvedBy: "ops@test.unagency",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    const draft = await policies.createFromApprovedCandidate({
      candidate: approved,
      createId: (p) => `${p}_pol_boot`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      rolloutPercentage: 100,
    });
    await policies.approvePolicy({
      policyId: draft.policyId,
      approvedBy: "ops@test.unagency",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    const active = await policies.activatePolicy({
      policyId: draft.policyId,
      approvedBy: "ops@test.unagency",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    await policyStore.save(active);

    const platform = composeAdaptiveRoutingPlatform({
      providerRegistry,
      modelRegistry: modelPlatform.registry,
      compatibilityEngine,
      policyStore,
      useMongoPersistence: false,
    });

    const startup = await bootstrapAdaptiveRoutingAtStartup(platform, {
      providerRegistry,
      modelRegistry: modelPlatform.registry,
      compatibilityEngine,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(startup.invalidCount).toBeGreaterThan(0);
    const updated = await policyStore.get(active.policyId);
    expect(updated?.lifecycle).toBe("PAUSED");

    const decision = await resolveAdaptiveRoutingDecision(
      Object.freeze({
        requestId: "req_boot",
        organizationId: "org_boot",
        capabilityId: "text.generate",
        scope: Object.freeze({ service: "social", subtype: "copywriting", industry: "fashion" }),
        actual: Object.freeze({
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          strategyId: "strategy.baseline",
        }),
      }),
      { ...platform.decisionDeps, env: { ADAPTIVE_ROUTING_ENABLED: "true" } as NodeJS.ProcessEnv },
    );
    expect(decision.decision).toBe("USE_EXISTING");
  });

  it("bootstrapEnterpriseApiRuntime wires platform used by startup validation", async () => {
    const stores = getSharedTestDurableStores();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      durableStores: stores,
    });
    const result = await runEnterpriseAdaptiveRoutingStartupValidation(runtime.platform);
    expect(result.ran).toBe(true);
  });

  it("mock benchmark execution produces ModelPerformanceRecord with provenance", async () => {
    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const executor = createBenchmarkProviderExecutor({ dispatcher });
    const model: BenchmarkModelTarget = STAGE1_REAL_VALIDATION_MODELS[0]!;
    const benchmarkId = STAGE1_REAL_VALIDATION_BENCHMARK_IDS[0]!;

    const result = await runBenchmark(
      {
        benchmarkId,
        model,
        organizationId: "org_pre_pilot",
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        knowledgeVersion: "stage1.default",
        executeModel: executor,
      },
      { recordStore, clearCache: true },
    );

    expect(result.record.performanceRecordId).toBeTruthy();
    expect(result.record.benchmarkId).toBe(benchmarkId);
    expect(result.record.contractVersion).toBeTruthy();
    expect(result.record.evidenceMode).toBe("controlled");
  });

  it("Step 2 validation is invoked for benchmark output", async () => {
    const bc = getBenchmarkCase("bench.social.copywriting")!;
    const validation = validateOutputContract({
      organizationId: "org_step2",
      executionId: "exec_step2",
      service: bc.service,
      subtype: bc.subtype,
      outputKind: bc.outputKind,
      preview: "Professional social copy with brand voice and clear call to action for the audience.",
      briefObjective: bc.inputBrief,
    });
    expect(validation).toBeTruthy();
    expect(validation!.contractId).toBeTruthy();
    expect(validation!.qualityDimensions.length).toBeGreaterThan(0);
  });

  it("artifact evaluation path is invoked when deps provided", async () => {
    const bc = getBenchmarkCase(STAGE1_REAL_VALIDATION_BENCHMARK_IDS[0]!)!;
    const outcome = await resolveBenchmarkValidationAsync({
      benchmarkCase: bc,
      executionOutput: Object.freeze({
        preview: "Website landing page structured output placeholder",
        latencyMs: 100,
        skippedPreFlight: false,
      }),
      organizationId: "org_art",
      executionId: "exec_art",
    });
    expect(outcome.kind).toBeDefined();
  });

  it("readable benchmark real logging helper produces pipeline verification", () => {
    const bc = getBenchmarkCase("bench.social.copywriting")!;
    const model = STAGE1_REAL_VALIDATION_MODELS[0]!;
    clearValidationCache();
    const validation = validateOutputContract({
      organizationId: "org_log",
      executionId: "exec_log",
      service: bc.service,
      subtype: bc.subtype,
      outputKind: bc.outputKind,
      preview: "Professional social copy with brand voice and clear call to action for the audience.",
      briefObjective: bc.inputBrief,
    })!;
    const record = buildModelPerformanceRecord({
      benchmarkCase: bc,
      validation,
      model,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      executionId: "exec_log",
      organizationId: "org_log",
      executionOutput: { preview: "test", latencyMs: 50 },
      createId: (p) => `${p}_log`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const input = {
      requestId: "req_log",
      executionId: "exec_log",
      benchmarkCase: bc,
      model,
      executionOutput: { preview: "test", latencyMs: 50, mediaArtifactIds: ["art_1"] },
      record,
      validation,
      hydratedArtifacts: [],
      artifactPersisted: true,
    };
    const pipeline = buildBenchmarkPipelineVerification(input);
    logBenchmarkRealExecutionSummary({ ...input, pipeline });
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("[UNAGENCY-BENCHMARK-REAL]"))).toBe(
      true,
    );
    expect(pipeline.step2Executed).toBe(true);
    expect(pipeline.performanceRecordCreated).toBe(true);
    logSpy.mockRestore();
  });

  it("production routing remains unchanged when adaptive disabled", async () => {
    const envDisabled = { ADAPTIVE_ROUTING_ENABLED: "false" } as NodeJS.ProcessEnv;
    const decision = await resolveAdaptiveRoutingDecision(
      Object.freeze({
        requestId: "req_static",
        organizationId: "org_static",
        capabilityId: "text.generate",
        scope: Object.freeze({ service: "website", subtype: "landing-page" }),
        actual: Object.freeze({
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          strategyId: "strategy.baseline",
        }),
      }),
      { env: envDisabled },
    );
    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("ADAPTIVE_DISABLED");
  });
});
