#!/usr/bin/env npx ts-node
/**
 * Step 10 — Production evidence + shadow integration diagnostic (opt-in, no routing changes).
 *
 * Usage:
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step10-production-shadow-validation.ts
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step10-production-shadow-validation.ts --inspect-store
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryShadowDecisionStore,
  createProductionIntelligenceQueryService,
  ingestProductionEvidenceAndShadow,
  resolveShadowDecision,
  buildModelPerformanceRecord,
  getBenchmarkCase,
  DEFAULT_BENCHMARK_STRATEGY,
  type BenchmarkModelTarget,
} from "../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../src/platform/os/evaluation/output-validation";

async function main(): Promise<void> {
  const inspectStore = process.argv.includes("--inspect-store");
  const routing = loadAdaptiveRoutingConfig(process.env);

  console.log("=".repeat(60));
  console.log("STEP 10 — PRODUCTION EVIDENCE + SHADOW VALIDATION");
  console.log("=".repeat(60));
  console.log(`Adaptive routing enabled: ${routing.adaptiveRoutingEnabled}`);
  console.log(`Mode: diagnostic only (no provider dispatch, no routing changes)`);

  if (routing.adaptiveRoutingEnabled) {
    console.error("ABORT: ADAPTIVE_ROUTING_ENABLED must be false.");
    process.exit(1);
  }

  const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
  const shadowStore = new InMemoryShadowDecisionStore();
  const query = createProductionIntelligenceQueryService({ recordStore, shadowStore });

  // Seed controlled benchmark evidence for shadow recommendations (no API calls).
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const model: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    capabilityId: "text.generate",
  });
  const validation = validateOutputContract({
    organizationId: "org_step10_diag",
    executionId: "exec_seed",
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview:
      "Professional social copy for Step 10 diagnostic validation with sufficient content length.",
    briefObjective: bc.inputBrief,
  })!;
  const seed = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: { ...validation, overallScore: 91 },
    model,
    strategy: Object.freeze({
      strategyId: "strategy.quality_first",
      version: "1.0.0",
    }),
    executionId: "exec_seed",
    organizationId: "org_step10_diag",
    executionOutput: {
      preview: "Professional social copy for Step 10 diagnostic validation with sufficient content length.",
      latencyMs: 800,
    },
    knowledgeId: "knowledge.fashion",
    knowledgeVersion: "knowledge.fashion@3.0.0",
    knowledgeFingerprint: "fp_fashion",
    createId: (p) => `${p}_seed`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });
  await recordStore.append(
    Object.freeze({
      ...seed,
      qualityScore: 91,
      benchmarkOutcome: "MODEL_QUALITY_FAILURE" as const,
      validForModelComparison: true,
    }),
  );

  const production = await ingestProductionEvidenceAndShadow(
    Object.freeze({
      organizationId: "org_step10_diag",
      productionExecutionId: "exec_prod_diag",
      requestId: "req_diag",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      capabilityId: "text.generate",
      service: "social",
      subtype: "copywriting",
      outputKind: "text",
      industry: "fashion",
      preview:
        "Engaging fashion social post with brand voice and clear CTA for diagnostic validation run.",
      briefObjective: bc.inputBrief,
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      latencyMs: 950,
      providerSuccess: true,
      createId: (p) => `${p}_diag`,
      nowIso: () => new Date().toISOString(),
    }),
    { recordStore, shadowStore },
  );

  console.log("\n--- Production Evidence ---");
  console.log(`Evidence recorded: ${production.evidenceRecorded}`);
  console.log(`Evidence source: ${production.performanceRecord?.evidenceSource}`);
  console.log(`Evidence mode: ${production.performanceRecord?.evidenceMode}`);
  console.log(`Quality score: ${production.performanceRecord?.qualityScore ?? "n/a"}`);

  console.log("\n--- Shadow Decision ---");
  console.log(`Shadow status: ${production.shadowDecision?.status ?? "n/a"}`);
  console.log(`Promotion readiness: ${production.shadowDecision?.promotionReadiness ?? "n/a"}`);
  console.log(`Recommendation reason: ${production.shadowDecision?.recommendationReason ?? "n/a"}`);

  const shadowOnly = await resolveShadowDecision(
    Object.freeze({
      productionExecutionId: "exec_shadow_only",
      organizationId: "org_step10_diag",
      service: "social",
      subtype: "copywriting",
      outputKind: "text",
      industry: "fashion",
      capabilityId: "text.generate",
      actual: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        strategyId: "strategy.baseline",
        strategyVersion: "1.0.0",
        knowledgeId: "knowledge.fashion",
      }),
    }),
    { recordStore, createId: (p) => `${p}_shadow`, nowIso: () => new Date().toISOString() },
  );
  console.log(`\nShadow-only resolve status: ${shadowOnly.status}`);

  if (inspectStore) {
    const prodRows = await query.productionEvidence();
    const shadowRows = await query.shadowDecisions();
    const freq = await query.shadowRecommendationFrequency();
    console.log("\n--- Store Inspection ---");
    console.log(`Production records: ${prodRows.length}`);
    console.log(`Shadow decisions: ${shadowRows.length}`);
    console.log(`Shadow frequency: ${JSON.stringify(freq)}`);
  }

  console.log("\nValidation complete — no provider calls, no routing changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
