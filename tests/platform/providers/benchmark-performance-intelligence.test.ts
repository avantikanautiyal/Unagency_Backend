/**
 * Step 8 — Evidence collection + performance intelligence tests.
 */

import {
  buildEvidenceMatrix,
  formatEvidenceMatrixPlan,
  assertEvidenceCollectionBudget,
  collectEvidence,
  planEvidenceCollection,
  DEFAULT_EVIDENCE_TIER_THRESHOLDS,
  DEFAULT_SPECIALIZATION_THRESHOLDS,
  STEP8_PILOT_BUDGET,
  resolveEvidenceTier,
  filterValidComparisonRecords,
  separateEvidenceQuality,
  auditEvidenceCoverage,
  detectSpecializations,
  compareModelsAtScope,
  findMaterialDifferences,
  buildExtendedFingerprint,
  buildPerformanceIntelligenceReport,
  createPerformanceIntelligenceService,
  createPerformanceQueryService,
  InMemoryBenchmarkPerformanceRecordStore,
  buildModelPerformanceRecord,
  getBenchmarkCase,
  DEFAULT_BENCHMARK_STRATEGY,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

function mockRecord(input: {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly benchmarkId: string;
  readonly service: string;
  readonly industry?: string;
  readonly complexity?: "low" | "medium" | "high";
  readonly qualityScore: number;
  readonly hardRate?: number;
  readonly outcome?: ModelPerformanceRecord["benchmarkOutcome"];
  readonly validForComparison?: boolean;
  readonly latencyMs?: number;
  readonly cost?: number;
  readonly strategyId?: string;
  readonly knowledgeVersion?: string;
  readonly modelVersion?: string;
}): ModelPerformanceRecord {
  const bc = getBenchmarkCase(input.benchmarkId)!;
  const validation = validateOutputContract({
    organizationId: "org_step8",
    executionId: `exec_${input.id}`,
    service: input.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional deliverable content for benchmark intelligence testing with sufficient length.",
    briefObjective: bc.inputBrief,
  })!;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation,
    model: Object.freeze({
      providerId: input.providerId,
      modelId: input.modelId,
      modelVersion: input.modelVersion ?? "v1",
      capabilityId: "text.generate",
    }),
    strategy: DEFAULT_BENCHMARK_STRATEGY,
    executionId: `exec_${input.id}`,
    organizationId: "org_step8",
    executionOutput: {
      preview: "Professional deliverable content for benchmark intelligence testing with sufficient length.",
      latencyMs: input.latencyMs ?? 1200,
      estimatedCost: input.cost,
    },
    knowledgeVersion: input.knowledgeVersion,
    createId: () => input.id,
    nowIso: () => "2026-03-01T00:00:00.000Z",
  });

  return Object.freeze({
    ...record,
    qualityScore: input.qualityScore,
    hardRequirementPassRate: input.hardRate ?? 0.95,
    benchmarkOutcome: input.outcome ?? "MODEL_SUCCESS",
    validForModelComparison: input.validForComparison ?? true,
    strategyId: input.strategyId ?? record.strategyId,
    industry: input.industry ?? bc.industry,
    complexity: input.complexity ?? bc.complexity,
    costAvailable: input.cost != null,
    estimatedCost: input.cost,
  });
}

describe("Step 8 — Evidence Collection + Performance Intelligence", () => {
  beforeEach(() => {
    clearValidationCache();
  });

  const modelA: BenchmarkModelTarget = Object.freeze({
    providerId: "openai",
    modelId: "gpt-4o",
    modelVersion: "2024-08-06",
    capabilityId: "text.generate",
  });

  const modelB: BenchmarkModelTarget = Object.freeze({
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet",
    modelVersion: "20241022",
    capabilityId: "text.generate",
  });

  describe("evidence matrix generation", () => {
    it("builds pilot matrix without Cartesian explosion", () => {
      const plan = buildEvidenceMatrix({
        strategy: "pilot",
        models: [modelA, modelB],
        repeatCount: 2,
      });
      expect(plan.benchmarkCount).toBeGreaterThan(0);
      expect(plan.benchmarkCount).toBeLessThan(20);
      expect(plan.totalInvocations).toBe(plan.benchmarkCount * 2 * 2);
      expect(formatEvidenceMatrixPlan(plan)).toContain("Strategy: pilot");
    });

    it("filters industry suite by applicability", () => {
      const plan = buildEvidenceMatrix({
        strategy: "industry_suite",
        industries: ["fashion", "healthcare"],
        models: [modelA],
      });
      expect(plan.cells.every((c) => c.benchmarkCase.industry === "fashion" || c.benchmarkCase.industry === "healthcare")).toBe(true);
    });

    it("supports targeted benchmark selection", () => {
      const plan = buildEvidenceMatrix({
        strategy: "targeted",
        benchmarkIds: ["bench.social.copywriting", "bench.print.brochures"],
        models: [modelA, modelB],
      });
      expect(plan.benchmarkCount).toBe(2);
      expect(plan.totalInvocations).toBe(4);
    });

    it("enforces budget before execution", () => {
      const plan = buildEvidenceMatrix({
        strategy: "pilot",
        models: [modelA, modelB],
        repeatCount: 5,
      });
      expect(() =>
        assertEvidenceCollectionBudget(plan, {
          ...STEP8_PILOT_BUDGET,
          maxInvocations: 5,
        }),
      ).toThrow(/budget exceeded/i);
    });
  });

  describe("evidence validity and sample quality", () => {
    it("separates valid comparison from operational failures", () => {
      const records = [
        mockRecord({
          id: "r1",
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.social.copywriting",
          service: "social",
          qualityScore: 85,
        }),
        mockRecord({
          id: "r2",
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.social.copywriting",
          service: "social",
          qualityScore: 0,
          outcome: "PROVIDER_OPERATIONAL_FAILURE",
          validForComparison: false,
        }),
      ];
      const separated = separateEvidenceQuality(records);
      expect(separated.validComparison.length).toBe(1);
      expect(separated.operationalFailures.length).toBe(1);
      expect(filterValidComparisonRecords(records).length).toBe(1);
    });

    it("does not treat executor capability failures as model quality failures", () => {
      const record = mockRecord({
        id: "r3",
        providerId: "openai",
        modelId: "gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 0,
        outcome: "EXECUTION_CAPABILITY_UNAVAILABLE",
        validForComparison: false,
      });
      const separated = separateEvidenceQuality([record]);
      expect(separated.capabilityFailures.length).toBe(1);
      expect(separated.validComparison.length).toBe(0);
    });
  });

  describe("performance fingerprint aggregation", () => {
    it("preserves multidimensional quality and valid comparison counts", () => {
      const records = Array.from({ length: 4 }, (_, i) =>
        mockRecord({
          id: `fp_${i}`,
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.website.landing-page.fashion",
          service: "website",
          industry: "fashion",
          qualityScore: 80 + i,
          latencyMs: 1000 + i * 100,
          cost: 0.01,
        }),
      );

      const fp = buildExtendedFingerprint({
        records,
        scope: { providerId: "openai", modelId: "gpt-4o", service: "website", industry: "fashion" },
      })!;

      expect(fp.sampleCount).toBe(4);
      expect(fp.validComparisonSamples).toBe(4);
      expect(fp.latencyMsMedian).toBeGreaterThan(0);
      expect(fp.costPerValidComparisonSample).not.toBeNull();
      expect(Object.keys(fp.qualityDimensions).length).toBeGreaterThan(0);
    });

    it("uses configurable evidence tiers", () => {
      expect(resolveEvidenceTier(1)).toBe("INSUFFICIENT");
      expect(resolveEvidenceTier(4, DEFAULT_EVIDENCE_TIER_THRESHOLDS)).toBe("LOW");
      expect(resolveEvidenceTier(8, DEFAULT_EVIDENCE_TIER_THRESHOLDS)).toBe("MODERATE");
      expect(resolveEvidenceTier(12, DEFAULT_EVIDENCE_TIER_THRESHOLDS)).toBe("STRONG");
    });
  });

  describe("industry and service specialization", () => {
    it("preserves industry-specific performance differences", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const fashionRecords = Array.from({ length: 4 }, (_, i) =>
        mockRecord({
          id: `fashion_${i}`,
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.website.landing-page.fashion",
          service: "website",
          industry: "fashion",
          qualityScore: 92,
        }),
      );
      const healthcareRecords = Array.from({ length: 4 }, (_, i) =>
        mockRecord({
          id: `health_${i}`,
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.website.landing-page.healthcare",
          service: "website",
          industry: "healthcare",
          qualityScore: 78,
        }),
      );
      for (const r of [...fashionRecords, ...healthcareRecords]) {
        await store.append(r);
      }

      const intelligence = createPerformanceIntelligenceService({ recordStore: store });
      const fashionFp = await intelligence.modelPerformanceForServiceAndIndustry({
        providerId: "openai",
        modelId: "gpt-4o",
        service: "website",
        industry: "fashion",
      });
      const healthcareFp = await intelligence.modelPerformanceForServiceAndIndustry({
        providerId: "openai",
        modelId: "gpt-4o",
        service: "website",
        industry: "healthcare",
      });

      expect(fashionFp!.qualityScoreMean).toBeGreaterThan(healthcareFp!.qualityScoreMean);
      expect(fashionFp!.industry).toBe("fashion");
      expect(healthcareFp!.industry).toBe("healthcare");
    });

    it("detects material model differences at service×industry scope", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      for (let i = 0; i < 4; i++) {
        await store.append(
          mockRecord({
            id: `a_${i}`,
            providerId: "openai",
            modelId: "gpt-4o",
            benchmarkId: "bench.social.copywriting",
            service: "social",
            qualityScore: 88,
          }),
        );
        await store.append(
          mockRecord({
            id: `b_${i}`,
            providerId: "anthropic",
            modelId: "claude-3-5-sonnet",
            benchmarkId: "bench.social.copywriting",
            service: "social",
            qualityScore: 72,
          }),
        );
      }

      const comparisons = await createPerformanceIntelligenceService({ recordStore: store }).compareModels({
        modelA: { providerId: "openai", modelId: "gpt-4o" },
        modelB: { providerId: "anthropic", modelId: "claude-3-5-sonnet" },
      });

      const material = findMaterialDifferences(comparisons, 5);
      expect(material.length).toBeGreaterThan(0);
      expect(material[0]!.qualityDelta).toBeGreaterThan(5);
    });

    it("returns INSUFFICIENT_EVIDENCE when sample count is too low", () => {
      const fp = buildExtendedFingerprint({
        records: [
          mockRecord({
            id: "single",
            providerId: "openai",
            modelId: "gpt-4o",
            benchmarkId: "bench.social.copywriting",
            service: "social",
            qualityScore: 95,
          }),
        ],
        scope: { providerId: "openai", modelId: "gpt-4o", service: "social" },
      })!;

      const specializations = detectSpecializations({
        fingerprints: [fp],
        thresholds: DEFAULT_SPECIALIZATION_THRESHOLDS,
      });
      expect(specializations.every((s) => s.status === "INSUFFICIENT_EVIDENCE")).toBe(true);
    });
  });

  describe("evidence coverage audit", () => {
    it("distinguishes NO_EVIDENCE from POOR_PERFORMANCE", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      await store.append(
        mockRecord({
          id: "poor",
          providerId: "openai",
          modelId: "gpt-4o",
          benchmarkId: "bench.social.copywriting",
          service: "social",
          qualityScore: 30,
          outcome: "MODEL_QUALITY_FAILURE",
        }),
      );

      const intelligence = createPerformanceIntelligenceService({ recordStore: store });
      const coverage = await intelligence.evidenceCoverage({
        models: [{ providerId: "openai", modelId: "gpt-4o" }],
      });

      const socialCell = coverage.cells.find((c) => c.benchmarkId === "bench.social.copywriting");
      const noEvidenceCell = coverage.cells.find(
        (c) => c.benchmarkId === "bench.print.brochures" && c.sampleCount === 0,
      );

      expect(socialCell!.sampleCount).toBe(1);
      expect(noEvidenceCell!.status).toBe("NO_EVIDENCE");
    });
  });

  describe("regression and version separation", () => {
    it("filters regressions to valid comparison records only", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      for (let i = 0; i < 4; i++) {
        await store.append(
          mockRecord({
            id: `base_${i}`,
            providerId: "openai",
            modelId: "gpt-4o",
            benchmarkId: "bench.website.landing-page.healthcare",
            service: "website",
            industry: "healthcare",
            qualityScore: 90,
            modelVersion: "v1",
          }),
        );
        await store.append(
          mockRecord({
            id: `cand_${i}`,
            providerId: "openai",
            modelId: "gpt-4o",
            benchmarkId: "bench.website.landing-page.healthcare",
            service: "website",
            industry: "healthcare",
            qualityScore: 75,
            modelVersion: "v2",
          }),
        );
      }

      const intelligence = createPerformanceIntelligenceService({ recordStore: store });
      const report = await intelligence.detectRegressions(
        { providerId: "openai", modelId: "gpt-4o", modelVersion: "v1" },
        "openai",
        "gpt-4o",
      );
      expect(report.findings.some((f) => f.isRegression)).toBe(true);
    });
  });

  describe("query API and reports", () => {
    it("extends PerformanceQueryService with intelligence methods", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      for (let i = 0; i < 4; i++) {
        await store.append(
          mockRecord({
            id: `q_${i}`,
            providerId: "openai",
            modelId: "gpt-4o",
            benchmarkId: "bench.presentations.pitch-decks",
            service: "presentations",
            qualityScore: 85,
          }),
        );
      }

      const query = createPerformanceQueryService({ recordStore: store });
      expect(typeof query.strongestAreas).toBe("function");
      expect(typeof query.evidenceCoverage).toBe("function");
      expect(typeof query.compareModels).toBe("function");

      const fps = await query.aggregateFingerprints({ providerId: "openai" }, 2);
      expect(fps[0]!.validComparisonSamples).toBe(4);

      const report = query.buildReport(fps[0]!);
      expect(report.textReport).toContain("MODEL:");
      expect(report.evidence.validComparisonSamples).toBe(4);
    });
  });

  describe("controlled evidence collection", () => {
    it("supports dry-run planning without API calls", async () => {
      const output = await collectEvidence(
        {
          strategy: "targeted",
          benchmarkIds: ["bench.social.copywriting"],
          models: [modelA],
          organizationId: "org_dry",
          dryRun: true,
        },
        { recordStore: new InMemoryBenchmarkPerformanceRecordStore() },
      );
      expect(output.dryRun).toBe(true);
      expect(output.results.length).toBe(0);
      expect(output.plan.totalInvocations).toBe(1);
    });

    it("planEvidenceCollection returns matrix without execution", () => {
      const plan = planEvidenceCollection({
        strategy: "service_suite",
        services: ["social"],
        models: [modelA, modelB],
        repeatCount: 2,
      });
      expect(plan.cells.length).toBeGreaterThan(0);
    });
  });

  describe("append-only persistence", () => {
    it("never overwrites existing performance records", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const record = mockRecord({
        id: "append_only",
        providerId: "openai",
        modelId: "gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 80,
      });
      expect(await store.append(record)).toBe("inserted");
      expect(await store.append(record)).toBe("duplicate");
      expect(await store.count()).toBe(1);
    });
  });

  describe("production safety", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });
  });
});
