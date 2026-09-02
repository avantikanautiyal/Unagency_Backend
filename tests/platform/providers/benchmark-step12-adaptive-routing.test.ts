/**
 * Step 11 + Step 12 — Promotion governance and controlled adaptive routing tests.
 * No paid API calls.
 */

import {
  buildModelPerformanceRecord,
  getBenchmarkCase,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryRoutingPolicyStore,
  InMemoryAdaptiveRoutingDecisionStore,
  InMemoryPromotionCandidateStore,
  resolveAdaptiveRoutingDecision,
  applyAdaptiveRoutingToPrepass,
  createPromotionGovernanceService,
  createRoutingPolicyService,
  deterministicRolloutBucket,
  isRolloutSelected,
  selectMatchingPolicy,
  pausePolicyOnRegression,
  sliceAdaptiveVsStatic,
  createAdaptiveRoutingQueryService,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
  type AdaptiveRoutingPolicy,
  type PromotionCandidate,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
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
  readonly strategyId?: string;
  readonly knowledgeId?: string;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const validation = validateOutputContract({
    organizationId: "org_step12",
    executionId: `exec_${input.id}`,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional social copy for step twelve adaptive routing controlled evidence.",
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
    organizationId: "org_step12",
    executionOutput: {
      preview: "Professional social copy for step twelve adaptive routing controlled evidence.",
      latencyMs: 800,
    },
    knowledgeId: input.knowledgeId ?? "knowledge.fashion",
    knowledgeVersion: "knowledge.fashion@3.0.0",
    createId: (p) => `${p}_${input.id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });

  return Object.freeze({
    ...record,
    qualityScore: input.qualityScore,
    industry: "fashion",
    benchmarkOutcome: "MODEL_QUALITY_FAILURE" as const,
    validForModelComparison: true,
  });
}

async function seedAdaptiveEvidence(store: InMemoryBenchmarkPerformanceRecordStore) {
  for (let i = 0; i < 4; i++) {
    await store.append(
      controlledRecord({
        id: `adaptive_${i}`,
        model: adaptiveModel,
        qualityScore: 90 + i,
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
}): Promise<AdaptiveRoutingPolicy> {
  const governance = createPromotionGovernanceService({ store: input.promotionStore });
  const policies = createRoutingPolicyService({ store: input.policyStore });

  const shadowDecision = Object.freeze({
    shadowDecisionId: "shadow_test",
    productionExecutionId: "exec_test",
    status: "SHADOW_RECOMMENDATION" as const,
    actual: Object.freeze({
      providerId: staticModel.providerId,
      modelId: staticModel.modelId,
      strategyId: "strategy.baseline",
    }),
    recommended: Object.freeze({
      providerId: adaptiveModel.providerId,
      modelId: adaptiveModel.modelId,
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
    createId: (p) => `${p}_gov`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });
  await governance.submitForReview(candidate.candidateId);
  const approved = await governance.approveCandidate({
    candidateId: candidate.candidateId,
    approvedBy: "ops@test.unagency",
    nowIso: () => "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  const draft = await policies.createFromApprovedCandidate({
    candidate: approved,
    createId: (p) => `${p}_pol`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    rolloutPercentage: input.rolloutPercentage ?? 100,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  await policies.approvePolicy({
    policyId: draft.policyId,
    approvedBy: "ops@test.unagency",
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });
  return policies.activatePolicy({
    policyId: draft.policyId,
    approvedBy: "ops@test.unagency",
    nowIso: () => "2026-01-01T00:00:00.000Z",
  }).then(async (active) => {
    const relaxed = Object.freeze({
      ...active,
      minimumConfidence: "low" as const,
      minimumSamples: 2,
    });
    await input.policyStore.save(relaxed);
    return relaxed;
  });
}

describe("Step 12 — Controlled Adaptive Routing Activation", () => {
  let recordStore: InMemoryBenchmarkPerformanceRecordStore;
  let policyStore: InMemoryRoutingPolicyStore;
  let decisionStore: InMemoryAdaptiveRoutingDecisionStore;
  let promotionStore: InMemoryPromotionCandidateStore;
  const envDisabled = { ADAPTIVE_ROUTING_ENABLED: "false" } as NodeJS.ProcessEnv;
  const envEnabled = { ADAPTIVE_ROUTING_ENABLED: "true" } as NodeJS.ProcessEnv;

  beforeEach(() => {
    clearValidationCache();
    recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    policyStore = new InMemoryRoutingPolicyStore();
    decisionStore = new InMemoryAdaptiveRoutingDecisionStore();
    promotionStore = new InMemoryPromotionCandidateStore();
  });

  const baseContext = Object.freeze({
    requestId: "req_step12",
    executionId: "exec_step12",
    organizationId: "org_step12",
    capabilityId: "text.generate",
    scope: Object.freeze({
      service: "social",
      subtype: "copywriting",
      industry: "fashion",
    }),
    actual: Object.freeze({
      providerId: staticModel.providerId,
      modelId: staticModel.modelId,
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.fashion",
    }),
  });

  it("uses existing route when adaptive routing is disabled (safety regression)", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envDisabled,
    });

    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("ADAPTIVE_DISABLED");
    expect(loadAdaptiveRoutingConfig(envDisabled).adaptiveRoutingEnabled).toBe(false);
  });

  it("selects adaptive candidate when enabled, approved, and rollout 100%", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envEnabled,
      isCandidateExecutable: () => true,
    });

    expect(decision.decision).toBe("USE_ADAPTIVE");
    expect(decision.reason).toBe("APPROVED_CANDIDATE");
    expect(decision.adaptive?.providerId).toBe(adaptiveModel.providerId);
  });

  it("returns USE_EXISTING for insufficient evidence", async () => {
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envEnabled,
    });

    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns USE_EXISTING for rollout 0%", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 0 });

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envEnabled,
      isCandidateExecutable: () => true,
    });

    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("ROLLOUT_NOT_SELECTED");
  });

  it("uses deterministic rollout hashing", () => {
    const a = deterministicRolloutBucket({
      requestId: "req_stable",
      policyId: "policy_1",
      policyVersion: "1.0.0",
    });
    const b = deterministicRolloutBucket({
      requestId: "req_stable",
      policyId: "policy_1",
      policyVersion: "1.0.0",
    });
    expect(a).toBe(b);
    expect(isRolloutSelected(a, 100)).toBe(true);
    expect(isRolloutSelected(a, 0)).toBe(false);
  });

  it("returns CAPABILITY_MISMATCH when candidate not executable", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envEnabled,
      isCandidateExecutable: () => false,
    });

    expect(decision.decision).toBe("USE_EXISTING");
    expect(decision.reason).toBe("CAPABILITY_MISMATCH");
  });

  it("prefers narrowest scope policy", async () => {
    const broad: AdaptiveRoutingPolicy = Object.freeze({
      policyId: "policy_broad",
      policyVersion: "1.0.0",
      lifecycle: "ACTIVE",
      enabled: true,
      scope: Object.freeze({ service: "social" }),
      candidate: Object.freeze({
        providerId: adaptiveModel.providerId,
        modelId: adaptiveModel.modelId,
        strategyId: "strategy.quality_first",
      }),
      promotionCandidateId: "promo_broad",
      rolloutPercentage: 100,
      minimumConfidence: "medium",
      minimumSamples: 1,
      maxCostIncrease: 2,
      maxLatencyIncrease: 2,
      maxReliabilityRegression: 0.5,
      maxQualityRegression: 20,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const narrow: AdaptiveRoutingPolicy = Object.freeze({
      ...broad,
      policyId: "policy_narrow",
      scope: Object.freeze({
        service: "social",
        subtype: "copywriting",
        industry: "fashion",
      }),
    });
    await policyStore.save(broad);
    await policyStore.save(narrow);

    const selected = selectMatchingPolicy(
      [broad, narrow],
      baseContext.scope,
      () => "2026-01-01T00:00:00.000Z",
    );
    expect(selected?.policyId).toBe("policy_narrow");
  });

  it("returns CANDIDATE_EXPIRED for expired policy", async () => {
    await seedAdaptiveEvidence(recordStore);
    const policy = await approvedActivePolicy({
      policyStore,
      promotionStore,
      rolloutPercentage: 100,
    });
    await policyStore.save(
      Object.freeze({
        ...policy,
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    );

    const decision = await resolveAdaptiveRoutingDecision(baseContext, {
      recordStore,
      policyStore,
      decisionStore,
      env: envEnabled,
    });

    expect(decision.reason).toBe("CANDIDATE_EXPIRED");
  });

  it("requires explicit human approval for promotion candidates", async () => {
    const governance = createPromotionGovernanceService({ store: promotionStore });
    const candidate = await governance.registerFromShadowDecision({
      shadowDecision: Object.freeze({
        shadowDecisionId: "s1",
        productionExecutionId: "e1",
        status: "SHADOW_RECOMMENDATION",
        actual: baseContext.actual,
        recommended: Object.freeze({
          providerId: adaptiveModel.providerId,
          modelId: adaptiveModel.modelId,
          strategyId: "strategy.quality_first",
        }),
        recommendationScope: "social",
        evidenceCount: 4,
        validComparisonSamples: 4,
        confidenceTier: "medium",
        evidenceTier: "MODERATE",
        compatibilityStatus: "COMPARABLE",
        recommendationReason: "test",
        limitations: Object.freeze([]),
        decisionTimestamp: "2026-01-01T00:00:00.000Z",
        promotionReadiness: "READY_FOR_REVIEW",
      }) as ShadowDecision,
      scope: Object.freeze({ service: "social", subtype: "copywriting" }),
      createId: (p) => `${p}_x`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    expect(candidate.lifecycle).toBe("DRAFT");
    await expect(
      createRoutingPolicyService().createFromApprovedCandidate({
        candidate: candidate as PromotionCandidate,
        createId: (p) => p,
        nowIso: () => new Date().toISOString(),
      }),
    ).rejects.toThrow(/APPROVED/);
  });

  it("applyAdaptiveRoutingToPrepass preserves static pins when disabled", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

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
      organizationId: "org_step12",
      executionId: "exec_prepass",
      requestId: "req_prepass",
      createId: (p) => `${p}_p`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      deps: { recordStore, policyStore, decisionStore, env: envDisabled },
    });

    expect(result.req.providerId).toBe(staticModel.providerId);
    expect(result.req.modelId).toBe(staticModel.modelId);
    expect(result.routingMetadata.routingMode).toBe("static");
  });

  it("applyAdaptiveRoutingToPrepass switches pins when adaptive selected", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore, rolloutPercentage: 100 });

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
      organizationId: "org_step12",
      executionId: "exec_prepass_adaptive",
      requestId: "req_prepass_adaptive",
      createId: (p) => `${p}_pa`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      deps: {
        recordStore,
        policyStore,
        decisionStore,
        env: envEnabled,
        isCandidateExecutable: () => true,
      },
    });

    expect(result.req.providerId).toBe(adaptiveModel.providerId);
    expect(result.req.modelId).toBe(adaptiveModel.modelId);
    expect(result.routingMetadata.routingMode).toBe("adaptive");
    expect(result.routingMetadata.adaptiveSelected).toBe(true);
  });

  it("pauses policy automatically on regression", async () => {
    const policy = await approvedActivePolicy({
      policyStore,
      promotionStore,
      rolloutPercentage: 100,
    });
    const records: ModelPerformanceRecord[] = [
      Object.freeze({
        ...controlledRecord({ id: "a1", model: adaptiveModel, qualityScore: 40 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "a2", model: adaptiveModel, qualityScore: 35 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "a3", model: adaptiveModel, qualityScore: 38 }),
        routingMode: "adaptive" as const,
      }),
      Object.freeze({
        ...controlledRecord({ id: "s1", model: staticModel, qualityScore: 85 }),
        routingMode: "static" as const,
      }),
    ];

    const slice = sliceAdaptiveVsStatic(records);
    expect(slice.adaptiveQualityMean).toBeLessThan(slice.staticQualityMean);

    const paused = await pausePolicyOnRegression({
      policy,
      records,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      createId: (p) => `${p}_rb`,
      policyStore,
    });
    expect(paused.paused).toBe(true);
    const updated = await policyStore.get(policy.policyId);
    expect(updated?.lifecycle).toBe("PAUSED");
  });

  it("exposes adaptive routing query health", async () => {
    await seedAdaptiveEvidence(recordStore);
    await approvedActivePolicy({ policyStore, promotionStore });

    const query = createAdaptiveRoutingQueryService({
      recordStore,
      policyStore,
      decisionStore,
      promotionStore,
    });
    const health = await query.getAdaptiveRoutingHealth();
    expect(health.activePolicies).toBe(1);
  });

  it("defaults adaptive routing to disabled globally", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});

describe("Step 11 — Promotion Governance", () => {
  it("requires approvedBy for human approval", async () => {
    const store = new InMemoryPromotionCandidateStore();
    const governance = createPromotionGovernanceService({ store });
    const c = await governance.registerFromShadowDecision({
      shadowDecision: Object.freeze({
        shadowDecisionId: "s",
        productionExecutionId: "e",
        status: "SHADOW_RECOMMENDATION",
        actual: Object.freeze({ providerId: "p", modelId: "m", strategyId: "strategy.baseline" }),
        recommendationScope: "social",
        evidenceCount: 4,
        validComparisonSamples: 4,
        confidenceTier: "medium",
        evidenceTier: "MODERATE",
        compatibilityStatus: "COMPARABLE",
        recommendationReason: "r",
        limitations: Object.freeze([]),
        decisionTimestamp: "2026-01-01T00:00:00.000Z",
        promotionReadiness: "READY_FOR_REVIEW",
      }) as ShadowDecision,
      scope: Object.freeze({ service: "social" }),
      createId: (p) => p,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    await governance.submitForReview(c.candidateId);
    await expect(
      governance.approveCandidate({
        candidateId: c.candidateId,
        approvedBy: "",
        nowIso: () => new Date().toISOString(),
      }),
    ).rejects.toThrow(/approvedBy/);
  });
});
