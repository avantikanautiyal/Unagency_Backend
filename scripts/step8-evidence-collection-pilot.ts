#!/usr/bin/env npx ts-node
/**
 * Step 8 — Controlled real-world evidence collection (small pilot).
 *
 * Usage:
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step8-evidence-collection-pilot.ts
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step8-evidence-collection-pilot.ts --execute
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { evaluateTextProviderEnv } from "../src/platform/production/execution/text-provider-env";
import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  buildEvidenceMatrix,
  formatEvidenceMatrixPlan,
  collectEvidence,
  createPerformanceIntelligenceService,
  InMemoryBenchmarkPerformanceRecordStore,
  findMaterialDifferences,
  formatModelComparisonReport,
  STEP8_PILOT_BUDGET,
  createRealBenchmarkExecutionService,
  type BenchmarkModelTarget,
} from "../src/platform/providers/routing/performance/benchmark";

const STEP8_BENCHMARK_IDS = [
  "bench.social.copywriting",
  "bench.website.landing-page.fashion",
  "bench.website.landing-page.healthcare",
  "bench.presentations.pitch-decks.technology",
  "bench.print.brochures",
];

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const routing = loadAdaptiveRoutingConfig(process.env);
  const providers = evaluateTextProviderEnv(process.env).filter((p) => p.enabled && p.configured);

  console.log("=".repeat(60));
  console.log("STEP 8 — CONTROLLED EVIDENCE COLLECTION PILOT");
  console.log("=".repeat(60));
  console.log(`Adaptive routing: ${routing.adaptiveRoutingEnabled}`);
  console.log(`Configured providers: ${providers.length}`);

  const models: BenchmarkModelTarget[] = providers.slice(0, 3).map((p) =>
    Object.freeze({
      providerId: p.providerId,
      modelId: p.providerId.includes("anthropic")
        ? "claude-3-5-sonnet-20241022"
        : p.providerId.includes("openai")
          ? "gpt-4o"
          : "default-model",
      capabilityId: "text.generate",
    }),
  );

  if (models.length < 2) {
    console.log("\nInsufficient configured providers — running deterministic simulation instead.");
    await runDeterministicSimulation();
    return;
  }

  const plan = buildEvidenceMatrix({
    strategy: "targeted",
    benchmarkIds: STEP8_BENCHMARK_IDS,
    models,
    repeatCount: execute ? 1 : 1,
  });

  console.log("\n" + formatEvidenceMatrixPlan(plan));

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute for controlled API calls.");
    return;
  }

  const store = new InMemoryBenchmarkPerformanceRecordStore();
  const service = createRealBenchmarkExecutionService({
    recordStore: store,
    useProductionExecutor: true,
  });

  const output = await service.runControlled({
    benchmarkIds: STEP8_BENCHMARK_IDS,
    models,
    organizationId: process.env.BENCHMARK_ORG_ID ?? "org_step8_pilot",
    repeatConfig: { repeatCount: 1, nondeterministic: true },
    budget: STEP8_PILOT_BUDGET,
    allowLargeRun: true,
  });

  console.log(`\nCollected ${output.results.length} evidence records.`);

  const intelligence = createPerformanceIntelligenceService({ recordStore: store });
  const coverage = await intelligence.evidenceCoverage({ models });
  console.log("\n" + intelligence.formatCoverage(coverage));

  if (models.length >= 2) {
    const comparisons = await intelligence.compareModels({
      modelA: { providerId: models[0]!.providerId, modelId: models[0]!.modelId },
      modelB: { providerId: models[1]!.providerId, modelId: models[1]!.modelId },
    });
    const material = findMaterialDifferences(comparisons, 3);
    console.log("\n" + formatModelComparisonReport(material.length > 0 ? material : comparisons));
    if (material.length === 0) {
      console.log("\nINSUFFICIENT_EVIDENCE for material specialization difference in this pilot run.");
    }
  }
}

async function runDeterministicSimulation(): Promise<void> {
  const store = new InMemoryBenchmarkPerformanceRecordStore();
  const models: BenchmarkModelTarget[] = [
    Object.freeze({ providerId: "openai", modelId: "gpt-4o", capabilityId: "text.generate" }),
    Object.freeze({ providerId: "anthropic", modelId: "claude-3-5-sonnet", capabilityId: "text.generate" }),
  ];

  let call = 0;
  await collectEvidence(
    {
      strategy: "targeted",
      benchmarkIds: STEP8_BENCHMARK_IDS.slice(0, 3),
      models,
      organizationId: "org_step8_sim",
      repeatCount: 2,
      budget: STEP8_PILOT_BUDGET,
      executeModel: async ({ benchmarkCase, model }) => {
        call++;
        const isFashion = benchmarkCase.industry === "fashion";
        const isSocial = benchmarkCase.service === "social";
        const modelA = model.modelId === "gpt-4o";
        let quality = 75;
        if (isFashion && modelA) quality = 92;
        if (isSocial && !modelA) quality = 91;
        if (benchmarkCase.service === "website" && benchmarkCase.industry === "healthcare" && !modelA) {
          quality = 94;
        }
        return {
          preview: `Simulated ${benchmarkCase.service} deliverable for ${benchmarkCase.industry ?? "general"} industry with professional content.`,
          latencyMs: 800 + call * 50,
          estimatedCost: 0.008,
        };
      },
    },
    { recordStore: store },
  );

  const intelligence = createPerformanceIntelligenceService({ recordStore: store });
  const comparisons = await intelligence.compareModels({
    modelA: { providerId: "openai", modelId: "gpt-4o" },
    modelB: { providerId: "anthropic", modelId: "claude-3-5-sonnet" },
  });
  const material = findMaterialDifferences(comparisons, 5);

  console.log("\n--- Deterministic Simulation Results ---");
  console.log(intelligence.formatComparisons(material.length > 0 ? material : comparisons));

  if (material.length > 0) {
    console.log("\n✓ Evidence-backed specialization difference detected in simulation.");
    for (const m of material) {
      console.log(`  ${m.scope}: quality Δ=${m.qualityDelta?.toFixed(1)} — ${m.tradeOffs.join("; ")}`);
    }
  } else {
    console.log("\nINSUFFICIENT_EVIDENCE for material difference.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
