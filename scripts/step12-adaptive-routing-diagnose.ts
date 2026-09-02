#!/usr/bin/env npx ts-node
/**
 * Step 12 — Adaptive routing dry-run diagnostic (no provider calls).
 *
 * Usage:
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step12-adaptive-routing-diagnose.ts
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step12-adaptive-routing-diagnose.ts --service social --industry fashion
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  createAdaptiveRoutingQueryService,
  resolveAdaptiveRoutingDecision,
  InMemoryRoutingPolicyStore,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryAdaptiveRoutingDecisionStore,
  buildModelPerformanceRecord,
  getBenchmarkCase,
  type BenchmarkModelTarget,
} from "../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../src/platform/os/evaluation/output-validation";

async function main(): Promise<void> {
  const service = process.argv.includes("--service")
    ? process.argv[process.argv.indexOf("--service") + 1] ?? "social"
    : "social";
  const industry = process.argv.includes("--industry")
    ? process.argv[process.argv.indexOf("--industry") + 1]
    : "fashion";

  const routing = loadAdaptiveRoutingConfig(process.env);
  console.log("=".repeat(60));
  console.log("STEP 12 — ADAPTIVE ROUTING DIAGNOSTIC (DRY RUN)");
  console.log("=".repeat(60));
  console.log(`Adaptive routing enabled: ${routing.adaptiveRoutingEnabled}`);
  console.log(`Scope: service=${service} industry=${industry ?? "any"}`);

  const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
  const policyStore = new InMemoryRoutingPolicyStore();
  const decisionStore = new InMemoryAdaptiveRoutingDecisionStore();
  const query = createAdaptiveRoutingQueryService({ recordStore, policyStore, decisionStore });

  const policies = await query.getActiveAdaptivePolicies();
  console.log(`Active policies: ${policies.length}`);

  const decision = await resolveAdaptiveRoutingDecision(
    Object.freeze({
      requestId: "diag_request_1",
      executionId: "diag_exec_1",
      organizationId: "org_diag",
      capabilityId: "text.generate",
      scope: Object.freeze({ service, subtype: "copywriting", industry }),
      actual: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        strategyId: "strategy.baseline",
        strategyVersion: "1.0.0",
      }),
    }),
    { recordStore, policyStore, decisionStore, env: process.env },
  );

  console.log("\n--- Decision ---");
  console.log(`Decision: ${decision.decision}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`Routing mode: ${decision.routingMode}`);
  console.log(`Confidence: ${decision.evidence.confidence}`);
  console.log(`Valid samples: ${decision.evidence.validComparisonSamples}`);
  if (decision.adaptive) {
    console.log(
      `Adaptive candidate: ${decision.adaptive.providerId}/${decision.adaptive.modelId}`,
    );
  }

  const health = await query.getAdaptiveRoutingHealth();
  console.log("\n--- Health ---");
  console.log(JSON.stringify(health, null, 2));
  console.log("\nNo provider calls made. No routing pins applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
