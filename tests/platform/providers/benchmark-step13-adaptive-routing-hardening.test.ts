/**
 * Step 13 — Production hardening + adaptive routing pilot readiness tests.
 * Zero paid API calls — deterministic fixtures only.
 */

import {
  buildModelPerformanceRecord,
  getBenchmarkCase,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryRoutingPolicyStore,
  InMemoryAdaptiveRoutingDecisionStore,
  InMemoryAdaptiveRollbackStore,
  InMemoryPromotionCandidateStore,
  resolveAdaptiveRoutingDecision,
  applyAdaptiveRoutingToPrepass,
  createPromotionGovernanceService,
  createRoutingPolicyService,
  deterministicRolloutBucket,
  isRolloutSelected,
  pausePolicyOnRegression,
  composeAdaptiveRoutingPlatform,
  bootstrapAdaptiveRoutingAtStartup,
  validateAdaptivePolicy,
  resolveAdaptiveExecutionOutcome,
  verifyAdaptiveCandidateCapability,
  createAdaptiveRoutingQueryService,
  ADAPTIVE_PILOT_TEMPLATE,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
  type AdaptiveRoutingPolicy,
  type PromotionCandidate,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { createModelRegistryPlatform } from "../../../src/platform/model-registry/factories/create-model-registry-platform";
import { DefaultCompatibilityEngine } from "../../../src/platform/model-registry/compatibility/default-compatibility-engine";
import { InMemoryProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import { asProviderId } from "../../../src/platform/core/identifiers";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { ShadowDecision } from "../../../src/platform/providers/routing/performance/benchmark/shadow/shadow-decision-contract";

const staticModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

const adaptiveModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.anthropic",
  modelId: "anthropic/claude-sonnet-4-5",
  capabilityId: "text.generate",
});

function controlledRecord(input: {
  readonly id: string;
  readonly model: BenchmarkModelTarget;
  readonly qualityScore: number;
  readonly latencyMs?: number;
  readonly cost?: number;
  readonly failure?: boolean;
  readonly strategyId?: string;
  readonly knowledgeId?: string;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const validation = validateOutputContract({
    organizationId: "org_step13",
    executionId: `exec_${input.id}`,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional social copy for step thirteen controlled evidence.",
    briefObjective: bc.inputBrief,
  })!;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: { ...validation, overallScore: input.qualityScore },
    model: input.model,
    strategy: Object.freeze({
      strategyId: input.strategyId ?? "strategy.quality_first",
      version: "1.0.0",
    }),
    executionId: `exec_${input.id}`,
    organizationId: "org_step13",
    executionOutput: {
      preview: "Professional social copy for step thirteen controlled evidence.",
      latencyMs: input.latencyMs ?? 800,
    },
    knowledgeId: input.knowledgeId ?? "knowledge.fashion",
    knowledgeVersion: "knowledge.fashion@3.0.0",
    createId: (p) => `${p}_${input.id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });

  return Object.freeze({
    ...record,
    qualityScore: input.qualityScore,
    latencyMs: input.latencyMs ?? 800,
    estimatedCost: input.cost ?? 0.02,
    costAvailable: true,
    industry: "fashion",
    benchmarkOutcome: input.failure ? ("PROVIDER_OPERATIONAL_FAILURE" as const) : ("MODEL_QUALITY_FAILURE" as const),
    reliabilityStatus: input.failure ? ("operational_failure" as const) : ("success" as const),
    validForModelComparison: !input.failure,
  });
}

function createHarness(input?: { readonly registerAnthropic?: boolean }) {
  const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
  const policyStore = new InMemoryRoutingPolicyStore();
  const decisionStore = new InMemoryAdaptiveRoutingDecisionStore();
  const rollbackStore = new InMemoryAdaptiveRollbackStore();
  const promotionStore = new InMemoryPromotionCandidateStore();
  const modelPlatform = createModelRegistryPlatform({ loadSeed: true });
  const compatibilityEngine = new DefaultCompatibilityEngine();
  const providerRegistry = new InMemoryProviderRuntimeRegistry();
  providerRegistry.registerExecutable({
    providerId: asProviderId("provider.openai"),
    dispatcher: new ControllableDispatcher(),
    status: "available",
    capabilities: ["text.generate"],
  });
  if (input?.registerAnthropic !== false) {
    providerRegistry.registerExecutable({
      providerId: asProviderId("provider.anthropic"),
      dispatcher: new ControllableDispatcher(),
      status: "available",
      capabilities: ["text.generate"],
    });
  }
  const platform = composeAdaptiveRoutingPlatform({
    providerRegistry,
    modelRegistry: modelPlatform.registry,
    compatibilityEngine,
    recordStore,
    policyStore,
    decisionStore,
    rollbackStore,
    useMongoPersistence: false,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    createId: (p) => `${p}_step13`,
  });
  const deps = Object.freeze({
    ...platform.decisionDeps,
    recordStore,
  });
  return Object.freeze({
    recordStore,
    policyStore,
    decisionStore,
    rollbackStore,
    promotionStore,
    providerRegistry,
    modelPlatform,
    compatibilityEngine,
    platform,
    deps,
  });
}

async function seedAdaptiveEvidence(store: InMemoryBenchmarkPerformanceRecordStore) {
  for (let i = 0; i < 4; i++) {
    await store.append(
      controlledRecord({
        id: `adaptive_${i}`,
        model: adaptiveModel,
        qualityScore: 92 + i,
      }),
    );
  }
  for (let i = 0; i < 2; i++) {
    await store.append(
      controlledRecord({
        id: `static_${i}`,
        model: staticModel,
        qualityScore: 72,
        strategyId: "strategy.baseline",
      }),
    );
  }
}

async function approvedActivePolicy(input: {
  readonly policyStore: InMemoryRoutingPolicyStore;
  readonly promotionStore: InMemoryPromotionCandidateStore;
  readonly rolloutPercentage?: number;
  readonly expiresAt?: string;
  readonly candidate?: { readonly providerId: string; readonly modelId: string };
  readonly idSuffix?: string;
}): Promise<AdaptiveRoutingPolicy> {
  const suffix = input.idSuffix ?? String(Date.now());
  const governance = createPromotionGovernanceService({ store: input.promotionStore });
  const policies = createRoutingPolicyService({ store: input.policyStore });
  const shadowDecision = Object.freeze({
    shadowDecisionId: `shadow_step13_${suffix}`,
    productionExecutionId: "exec_test",
    status: "SHADOW_RECOMMENDATION" as const,
    actual: Object.freeze({
      providerId: staticModel.providerId,
      modelId: staticModel.modelId,
      strategyId: "strategy.baseline",
    }),
    recommended: Object.freeze({
      providerId: input.candidate?.providerId ?? adaptiveModel.providerId,
      modelId: input.candidate?.modelId ?? adaptiveModel.modelId,
      strategyId: "strategy.quality_first",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.fashion",
    }),
    recommendationScope: "social / copywriting / fashion",
    evidenceCount: 4,
    validComparisonSamples: 4,
    confidenceTier: "medium" as const,
    evidenceTier: "MODERATE" as const,
    observedAdvantage: 18,
    compatibilityStatus: "COMPARABLE" as const,
    recommendationReason: "test",
    limitations: Object.freeze([]),
    decisionTimestamp: "2026-01-01T00:00:00.000Z",
    promotionReadiness: "READY_FOR_REVIEW" as const,
  }) satisfies ShadowDecision;

  const candidate = await governance.registerFromShadowDecision({
    shadowDecision,
    scope: Object.freeze({ service: "social", subtype: "copywriting", industry: "fashion" }),
    createId: (p) => `${p}_gov_${suffix}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });
  await governance.submitForReview(candidate.candidateId);
  const approved = await governance.approveCandidate({
    candidateId: candidate.candidateId,
    approvedBy: "ops@test.unagency",
    nowIso: () => "2026-01-01T00:00:00.000Z",
    expiresAt: input.expiresAt ?? "2099-01-01T00:00:00.000Z",
  });
  const draft = await policies.createFromApprovedCandidate({
    candidate: approved,
    createId: (p) => `${p}_pol_${suffix}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    rolloutPercentage: input.rolloutPercentage ?? 100,
    expiresAt: input.expiresAt ?? "2099-01-01T00:00:00.000Z",
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
  const relaxed = Object.freeze({
    ...active,
    minimumConfidence: "low" as const,
    minimumSamples: 2,
    ...(input.candidate
      ? {
          candidate: Object.freeze({
            ...active.candidate,
            providerId: input.candidate.providerId,
            modelId: input.candidate.modelId,
          }),
        }
      : {}),
  });
  await input.policyStore.save(relaxed);
  return relaxed;
}

function decisionContext(requestId = "req_step13") {
  return Object.freeze({
    requestId,
    executionId: "exec_step13",
    organizationId: "org_step13",
    capabilityId: "text.generate",
    scope: Object.freeze({ service: "social", subtype: "copywriting", industry: "fashion" }),
    actual: Object.freeze({
      providerId: staticModel.providerId,
      modelId: staticModel.modelId,
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.fashion",
    }),
  });
}

describe("Step 13 — Production Hardening + Adaptive Routing Pilot Readiness", () => {
  const envDisabled = { ADAPTIVE_ROUTING_ENABLED: "false" } as NodeJS.ProcessEnv;
  const envEnabled = { ADAPTIVE_ROUTING_ENABLED: "true" } as NodeJS.ProcessEnv;

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    expect(ADAPTIVE_PILOT_TEMPLATE.active).toBe(false);
  });

  it("uses static routing when adaptive is disabled", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envDisabled,
    });
    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("ADAPTIVE_DISABLED");
  });

  it("selects adaptive candidate when all gates pass", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore, rolloutPercentage: 100 });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.decision).toBe("USE_ADAPTIVE");
    expect(decision.telemetry?.event).toBe("adaptive_selected");
  });

  it("rejects candidate when provider is missing from registry", async () => {
    const h = createHarness({ registerAnthropic: false });
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.decision).toBe("USE_EXISTING");
    expect(["CAPABILITY_MISMATCH", "INVALID_POLICY"]).toContain(decision.reason);
  });

  it("rejects candidate with unsupported model capability", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({
      policyStore: h.policyStore,
      promotionStore: h.promotionStore,
      candidate: { providerId: "provider.openai", modelId: "openai/this-model-does-not-exist" },
    });
    const verdict = verifyAdaptiveCandidateCapability({
      context: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/this-model-does-not-exist",
        capabilityId: "text.generate",
        service: "social",
      }),
      providerRegistry: h.providerRegistry,
      modelRegistry: h.modelPlatform.registry,
      compatibilityEngine: h.compatibilityEngine,
    });
    expect(verdict.executable).toBe(false);
  });

  it("rejects expired policy", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({
      policyStore: h.policyStore,
      promotionStore: h.promotionStore,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("CANDIDATE_EXPIRED");
  });

  it("rejects unapproved active policy at decision time", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(
      Object.freeze({
        ...policy,
        approvedBy: undefined,
        approvedAt: undefined,
      }) as AdaptiveRoutingPolicy,
    );
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("INVALID_POLICY");
  });

  it("rejects insufficient controlled evidence", async () => {
    const h = createHarness();
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects low confidence evidence", async () => {
    const h = createHarness();
    await h.recordStore.append(
      controlledRecord({ id: "one", model: adaptiveModel, qualityScore: 90 }),
    );
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(
      Object.freeze({ ...policy, minimumSamples: 1, minimumConfidence: "high" as const }),
    );
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("LOW_CONFIDENCE");
  });

  it("rejects cost guard failure", async () => {
    const h = createHarness();
    for (let i = 0; i < 3; i++) {
      await h.recordStore.append(
        controlledRecord({
          id: `cost_a_${i}`,
          model: adaptiveModel,
          qualityScore: 95,
          cost: 0.2,
        }),
      );
      await h.recordStore.append(
        controlledRecord({
          id: `cost_s_${i}`,
          model: staticModel,
          qualityScore: 70,
          cost: 0.02,
          strategyId: "strategy.baseline",
        }),
      );
    }
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(Object.freeze({ ...policy, maxCostIncrease: 1.1 }));
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("COST_RISK");
  });

  it("rejects latency guard failure", async () => {
    const h = createHarness();
    for (let i = 0; i < 3; i++) {
      await h.recordStore.append(
        controlledRecord({
          id: `lat_a_${i}`,
          model: adaptiveModel,
          qualityScore: 95,
          latencyMs: 5000,
        }),
      );
      await h.recordStore.append(
        controlledRecord({
          id: `lat_s_${i}`,
          model: staticModel,
          qualityScore: 70,
          latencyMs: 800,
          strategyId: "strategy.baseline",
        }),
      );
    }
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(Object.freeze({ ...policy, maxLatencyIncrease: 1.1 }));
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("LATENCY_RISK");
  });

  it("rejects reliability guard failure", async () => {
    const h = createHarness();
    for (let i = 0; i < 4; i++) {
      await h.recordStore.append(
        controlledRecord({
          id: `rel_a_ok_${i}`,
          model: adaptiveModel,
          qualityScore: 95,
        }),
      );
    }
    for (let i = 0; i < 8; i++) {
      await h.recordStore.append(
        controlledRecord({
          id: `rel_a_fail_${i}`,
          model: adaptiveModel,
          qualityScore: 10,
          failure: true,
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      await h.recordStore.append(
        controlledRecord({
          id: `rel_s_${i}`,
          model: staticModel,
          qualityScore: 70,
          strategyId: "strategy.baseline",
        }),
      );
    }
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(Object.freeze({ ...policy, maxReliabilityRegression: 0.05, minimumSamples: 2 }));
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("RELIABILITY_RISK");
  });

  it("rejects quality regression guard", async () => {
    const h = createHarness();
    for (let i = 0; i < 3; i++) {
      await h.recordStore.append(
        controlledRecord({ id: `q_a_${i}`, model: adaptiveModel, qualityScore: 50 }),
      );
      await h.recordStore.append(
        controlledRecord({
          id: `q_s_${i}`,
          model: staticModel,
          qualityScore: 90,
          strategyId: "strategy.baseline",
        }),
      );
    }
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(Object.freeze({ ...policy, maxQualityRegression: 2 }));
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("SAFETY_GUARD");
  });

  it("applies deterministic 1% rollout behavior", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    const policy = await approvedActivePolicy({
      policyStore: h.policyStore,
      promotionStore: h.promotionStore,
      rolloutPercentage: 1,
    });
    let inRollout = 0;
    for (let i = 0; i < 1000; i++) {
      const bucket = deterministicRolloutBucket({
        requestId: `rollout_probe_${i}`,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
      });
      if (isRolloutSelected(bucket, 1)) inRollout += 1;
      expect(
        deterministicRolloutBucket({
          requestId: `rollout_probe_${i}`,
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
        }),
      ).toBe(bucket);
    }
    expect(inRollout).toBeGreaterThan(0);
    expect(inRollout).toBeLessThan(30);
  });

  it("records adaptive execution success telemetry metadata", () => {
    const stamped = resolveAdaptiveExecutionOutcome({
      executionId: "exec_ok",
      correlationId: "corr_ok",
      metadata: Object.freeze({
        adaptiveSelected: true,
        initialAdaptiveProviderId: adaptiveModel.providerId,
        initialAdaptiveModelId: adaptiveModel.modelId,
      }),
      finalProviderId: adaptiveModel.providerId,
      finalModelId: adaptiveModel.modelId,
      providerSucceeded: true,
    });
    expect(stamped.adaptiveExecutionSucceeded).toBe(true);
    expect(stamped.fallbackUsed).toBe(false);
  });

  it("records adaptive execution failure and fallback telemetry", () => {
    const stamped = resolveAdaptiveExecutionOutcome({
      executionId: "exec_fail",
      metadata: Object.freeze({
        adaptiveSelected: true,
        initialAdaptiveProviderId: adaptiveModel.providerId,
        initialAdaptiveModelId: adaptiveModel.modelId,
      }),
      finalProviderId: staticModel.providerId,
      finalModelId: staticModel.modelId,
      providerSucceeded: true,
      fallbackReason: "existing_failover",
    });
    expect(stamped.fallbackUsed).toBe(true);
    expect(stamped.initialAdaptiveProviderId).toBe(adaptiveModel.providerId);
    expect(stamped.finalProviderId).toBe(staticModel.providerId);
  });

  it("rollback pauses only the affected policy and persists event", async () => {
    const h = createHarness();
    const policyA = await approvedActivePolicy({
      policyStore: h.policyStore,
      promotionStore: h.promotionStore,
      idSuffix: "a",
    });
    const policyB = await approvedActivePolicy({
      policyStore: h.policyStore,
      promotionStore: h.promotionStore,
      idSuffix: "b",
    });
    const records = [
      Object.freeze({
        ...controlledRecord({ id: "rb_a1", model: adaptiveModel, qualityScore: 30 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "rb_a2", model: adaptiveModel, qualityScore: 32 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "rb_a3", model: adaptiveModel, qualityScore: 34 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "rb_s1", model: staticModel, qualityScore: 90 }),
        routingMode: "static" as const,
      }),
    ];
    const paused = await pausePolicyOnRegression({
      policy: policyA,
      records,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      createId: (p) => `${p}_rb`,
      policyStore: h.policyStore,
      rollbackStore: h.rollbackStore,
    });
    expect(paused.paused).toBe(true);
    const updatedA = await h.policyStore.get(policyA.policyId);
    const updatedB = await h.policyStore.get(policyB.policyId);
    expect(updatedA?.lifecycle).toBe("PAUSED");
    expect(updatedB?.lifecycle).toBe("ACTIVE");
    const rollbacks = await h.rollbackStore.query({ policyId: policyA.policyId });
    expect(rollbacks.length).toBe(1);
  });

  it("does not route adaptively through paused policy", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    await h.policyStore.save(
      Object.freeze({ ...policy, lifecycle: "PAUSED" as const, enabled: false }),
    );
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("CANDIDATE_UNAVAILABLE");
  });

  it("persists and reloads policy via store", async () => {
    const h = createHarness();
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const reloaded = await h.policyStore.get(policy.policyId);
    expect(reloaded?.policyId).toBe(policy.policyId);
    expect(reloaded?.candidate.modelId).toBe(adaptiveModel.modelId);
  });

  it("startup validation pauses invalid persisted policies", async () => {
    const h = createHarness({ registerAnthropic: false });
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    expect(policy.lifecycle).toBe("ACTIVE");
    const preCheck = validateAdaptivePolicy({
      policy,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      providerRegistry: h.providerRegistry,
      modelRegistry: h.modelPlatform.registry,
      compatibilityEngine: h.compatibilityEngine,
    });
    expect(preCheck.valid).toBe(false);
    const startup = await bootstrapAdaptiveRoutingAtStartup(h.platform, {
      providerRegistry: h.providerRegistry,
      modelRegistry: h.modelPlatform.registry,
      compatibilityEngine: h.compatibilityEngine,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(startup.invalidCount).toBeGreaterThan(0);
    const updated = await h.policyStore.get(policy.policyId);
    expect(updated?.lifecycle).toBe("PAUSED");
  });

  it("fails closed when adaptive enabled without durable persistence", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
      failClosedWhenEnabledWithoutPersistence: true,
    });
    expect(decision.reason).toBe("SAFETY_GUARD");
  });

  it("cannot bypass human approval via READY_FOR_REVIEW candidate", async () => {
    const h = createHarness();
    const governance = createPromotionGovernanceService({ store: h.promotionStore });
    const candidate = await governance.registerFromShadowDecision({
      shadowDecision: Object.freeze({
        shadowDecisionId: "s",
        productionExecutionId: "e",
        status: "SHADOW_RECOMMENDATION",
        actual: Object.freeze({ providerId: staticModel.providerId, modelId: staticModel.modelId }),
        recommended: Object.freeze({
          providerId: adaptiveModel.providerId,
          modelId: adaptiveModel.modelId,
        }),
        recommendationScope: "social",
        evidenceCount: 1,
        validComparisonSamples: 1,
        confidenceTier: "low",
        evidenceTier: "LOW",
        compatibilityStatus: "COMPARABLE",
        recommendationReason: "test",
        limitations: Object.freeze([]),
        decisionTimestamp: "2026-01-01T00:00:00.000Z",
        promotionReadiness: "READY_FOR_REVIEW",
      }) as ShadowDecision,
      scope: Object.freeze({ service: "social", subtype: "copywriting" }),
      createId: (p) => p,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(candidate.lifecycle).toBe("DRAFT");
    await expect(
      createRoutingPolicyService({ store: h.policyStore }).createFromApprovedCandidate({
        candidate: candidate as PromotionCandidate,
        createId: (p) => p,
        nowIso: () => new Date().toISOString(),
      }),
    ).rejects.toThrow(/APPROVED/);
  });

  it("does not treat observational production evidence as controlled comparison", async () => {
    const h = createHarness();
    await h.recordStore.append(
      Object.freeze({
        ...controlledRecord({ id: "obs_only", model: adaptiveModel, qualityScore: 95 }),
        evidenceSource: "production" as const,
        evidenceMode: "observational" as const,
        validForModelComparison: false,
      }),
    );
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const decision = await resolveAdaptiveRoutingDecision(decisionContext(), {
      ...h.deps,
      env: envEnabled,
    });
    expect(decision.reason).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("applyAdaptiveRoutingToPrepass leaves static routing unchanged when disabled", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const result = await applyAdaptiveRoutingToPrepass({
      workingMetadata: Object.freeze({
        service: "social",
        subtype: "copywriting",
        industry: "fashion",
        preferredProviderId: staticModel.providerId,
        preferredModelId: staticModel.modelId,
      }),
      req: Object.freeze({
        prompt: "test",
        capabilityId: "text.generate",
        providerId: staticModel.providerId,
        modelId: staticModel.modelId,
      }) as never,
      capabilityId: "text.generate",
      organizationId: "org_step13",
      executionId: "exec_prepass",
      requestId: "req_prepass",
      createId: (p) => `${p}_p`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      deps: { ...h.deps, env: envDisabled },
    });
    expect(result.req.providerId).toBe(staticModel.providerId);
    expect(result.routingMetadata.routingMode).toBe("static");
  });

  it("exposes query health including rollback and fallback metrics", async () => {
    const h = createHarness();
    await seedAdaptiveEvidence(h.recordStore);
    await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const query = createAdaptiveRoutingQueryService({
      recordStore: h.recordStore,
      policyStore: h.policyStore,
      decisionStore: h.decisionStore,
      rollbackStore: h.rollbackStore,
      promotionStore: h.promotionStore,
    });
    const health = await query.getAdaptiveRoutingHealth();
    expect(health.activePolicies).toBe(1);
    expect(health.rollbackEvents).toBe(0);
    expect(query.getPilotTemplate().rolloutPercentage).toBe(1);
  });

  it("validates policy readiness through query service", async () => {
    const h = createHarness();
    const policy = await approvedActivePolicy({ policyStore: h.policyStore, promotionStore: h.promotionStore });
    const query = createAdaptiveRoutingQueryService({
      policyStore: h.policyStore,
      providerRegistry: h.providerRegistry,
      modelRegistry: h.modelPlatform.registry,
      compatibilityEngine: h.compatibilityEngine,
    });
    const readiness = await query.getPolicyReadiness(policy.policyId);
    expect(readiness.valid).toBe(true);
    const invalid = validateAdaptivePolicy({
      policy: Object.freeze({ ...policy, approvedBy: undefined }) as AdaptiveRoutingPolicy,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      providerRegistry: h.providerRegistry,
      modelRegistry: h.modelPlatform.registry,
      compatibilityEngine: h.compatibilityEngine,
    });
    expect(invalid.valid).toBe(false);
  });
});
