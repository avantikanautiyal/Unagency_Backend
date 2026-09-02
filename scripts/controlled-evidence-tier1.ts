#!/usr/bin/env npx ts-node
/**
 * Step 15 — Tier 1 controlled evidence collection (dry-run by default).
 *
 * Dry-run (zero API calls):
 *   npm run benchmark:evidence:tier1
 *
 * Execute (explicit opt-in, budget-guarded):
 *   npm run benchmark:evidence:tier1:execute
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  OPENAI_TEXT_ENV,
  ANTHROPIC_TEXT_ENV,
  isTextProviderConfigured,
} from "../src/platform/production/execution/text-provider-env";
import { createModelRegistryPlatform } from "../src/platform/model-registry/factories/create-model-registry-platform";
import {
  TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  TIER1_CONTROLLED_EVIDENCE_MODELS,
  TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  tier1ControlledEvidenceCellCount,
} from "../src/platform/providers/routing/performance/benchmark/config/tier1-controlled-evidence-config";
import {
  planControlledEvidenceCollection,
  executeControlledEvidenceCollection,
  formatControlledEvidencePlan,
  evaluateTierExpansionCriteria,
} from "../src/platform/providers/routing/performance/benchmark/evidence/controlled-evidence-expansion";
import { buildRoutingReadinessReport } from "../src/platform/providers/routing/performance/benchmark/evidence/routing-readiness-report";
import {
  logEvidenceCollectionBanner,
  logEvidenceDryRunPlan,
  logEvidenceCellResult,
  logEvidenceCollectionComplete,
  EVIDENCE_COLLECTION_PREFIX,
} from "../src/platform/providers/routing/performance/benchmark/evidence/controlled-evidence-logger";
import {
  createProductionBenchmarkExecutor,
  InMemoryBenchmarkPerformanceRecordStore,
  createPerformanceIntelligenceService,
  compareModelsAtScope,
  detectSpecializations,
  getBenchmarkCase,
  type BenchmarkModelTarget,
} from "../src/platform/providers/routing/performance/benchmark";
function checkModelAvailability(): ReadonlyArray<{
  readonly model: BenchmarkModelTarget;
  readonly available: boolean;
  readonly reason?: string;
}> {
  const registry = createModelRegistryPlatform({ loadSeed: true }).registry;
  return TIER1_CONTROLLED_EVIDENCE_MODELS.map((model) => {
    if (model.providerId === OPENAI_TEXT_ENV.canonicalProviderId) {
      if (!isTextProviderConfigured(process.env, OPENAI_TEXT_ENV)) {
        return Object.freeze({
          model,
          available: false,
          reason: `Provider ${model.providerId} not configured`,
        });
      }
    } else if (model.providerId === ANTHROPIC_TEXT_ENV.canonicalProviderId) {
      if (!isTextProviderConfigured(process.env, ANTHROPIC_TEXT_ENV)) {
        return Object.freeze({
          model,
          available: false,
          reason: `Provider ${model.providerId} not configured`,
        });
      }
    }
    const registryModel = registry.getModel(model.modelId);
    if (!registryModel.ok) {
      return Object.freeze({ model, available: false, reason: `Model ${model.modelId} not in registry` });
    }
    return Object.freeze({ model, available: true });
  });
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const routing = loadAdaptiveRoutingConfig(process.env);

  if (routing.adaptiveRoutingEnabled) {
    console.error(`${EVIDENCE_COLLECTION_PREFIX} ABORT: ADAPTIVE_ROUTING_ENABLED must be false.`);
    process.exit(1);
  }

  const plan = planControlledEvidenceCollection({ tier: 1 });

  logEvidenceCollectionBanner({
    tier: 1,
    models: TIER1_CONTROLLED_EVIDENCE_MODELS,
    benchmarkIds: TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
    repeats: TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
    maxApiCalls: tier1ControlledEvidenceCellCount(),
    adaptiveRoutingEnabled: routing.adaptiveRoutingEnabled,
    concurrency: plan.concurrency,
  });

  console.log("\n" + formatControlledEvidencePlan(plan));
  logEvidenceDryRunPlan(plan);

  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Benchmark cases:`);
  for (const id of TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS) {
    const bc = getBenchmarkCase(id)!;
    console.log(
      `${EVIDENCE_COLLECTION_PREFIX}   ${id} → ${bc.service}/${bc.subtype} (${bc.outputKind})`,
    );
  }

  if (!execute) {
    console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Dry-run complete. ZERO provider API calls made.`);
    console.log(`${EVIDENCE_COLLECTION_PREFIX} To execute: npm run benchmark:evidence:tier1:execute`);
    return;
  }

  const availability = checkModelAvailability();
  const unavailable = availability.filter((a) => !a.available);
  if (unavailable.length > 0) {
    console.error(`${EVIDENCE_COLLECTION_PREFIX} ABORT: models unavailable:`);
    for (const u of unavailable) {
      console.error(`${EVIDENCE_COLLECTION_PREFIX}   ${u.model.modelId}: ${u.reason}`);
    }
    process.exit(1);
  }

  const organizationId = process.env.BENCHMARK_ORG_ID ?? "org_step15_evidence";
  const store = new InMemoryBenchmarkPerformanceRecordStore();
  const intelligence = createPerformanceIntelligenceService({ recordStore: store });

  const executor = await createProductionBenchmarkExecutor({
    organizationId,
    repeatConfig: { repeatCount: 1, nondeterministic: true },
  });

  const result = await executeControlledEvidenceCollection(
    {
      tier: 1,
      organizationId,
      dryRun: false,
      executeModel: executor,
      recordExecutionTrace: true,
    },
    { recordStore: store },
  );

  for (const cell of plan.cells) {
    const record = result.records.find(
      (r) =>
        r.benchmarkId === cell.benchmarkId &&
        r.modelId === cell.model.modelId,
    );
    if (!record) continue;
    const bc = getBenchmarkCase(cell.benchmarkId)!;
    logEvidenceCellResult({
      benchmarkId: cell.benchmarkId,
      benchmarkCase: bc,
      model: cell.model,
      repeatIndex: cell.repeatIndex ?? 0,
      record,
      contractStatus: record.contractValidationStatus,
      evidenceStatus: record.evidenceMode,
    });
  }

  logEvidenceCollectionComplete({
    plannedCalls: plan.totalInvocations,
    executedCalls: result.executedCalls,
    recordsGenerated: result.records.length,
    totalCostUsd: result.totalCostUsd > 0 ? result.totalCostUsd : undefined,
    adaptiveRoutingEnabled: routing.adaptiveRoutingEnabled,
  });

  const records = await store.query({ organizationId, limit: 200 });
  const readiness = buildRoutingReadinessReport({ records, organizationId });
  console.log("\n" + readiness.textReport);

  const expansion = evaluateTierExpansionCriteria({ records, completedTier: 1 });
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Tier expansion recommendation: ${expansion}`);

  const comparisons = compareModelsAtScope({
    records,
    modelA: TIER1_CONTROLLED_EVIDENCE_MODELS[0]!,
    modelB: TIER1_CONTROLLED_EVIDENCE_MODELS[1]!,
  });
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Model comparisons: ${comparisons.length}`);
  for (const c of comparisons) {
    console.log(
      `${EVIDENCE_COLLECTION_PREFIX}   ${c.modelA.modelId} vs ${c.modelB.modelId}: ${c.status}` +
        (c.qualityDelta != null ? ` qualityΔ=${c.qualityDelta.toFixed(1)}` : ""),
    );
  }

  const specializations = detectSpecializations({
    fingerprints: await intelligence.aggregateFingerprints({ organizationId }),
  });
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Specialization candidates: ${specializations.length}`);

  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} Adaptive routing remained OFF throughout.`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Do NOT use these results to activate adaptive routing without human review.`);
}

main().catch((err) => {
  console.error(`${EVIDENCE_COLLECTION_PREFIX} FATAL:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
