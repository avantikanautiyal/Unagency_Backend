#!/usr/bin/env npx ts-node
/**
 * Step 13 — Adaptive routing pilot readiness diagnostic (zero provider calls).
 *
 * Usage:
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step13-adaptive-routing-readiness.ts
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/step13-adaptive-routing-readiness.ts --service social --industry fashion
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { createModelRegistryPlatform } from "../src/platform/model-registry/factories/create-model-registry-platform";
import { DefaultCompatibilityEngine } from "../src/platform/model-registry/compatibility/default-compatibility-engine";
import { InMemoryProviderRuntimeRegistry } from "../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import { asProviderId } from "../src/platform/core/identifiers";
import { ControllableDispatcher } from "../src/platform/providers/runtime/testing";
import {
  composeAdaptiveRoutingPlatform,
  ADAPTIVE_PILOT_TEMPLATE,
  resolveAdaptiveRoutingDecision,
  selectMatchingPolicy,
  verifyAdaptiveCandidateCapability,
  createAdaptiveRoutingQueryService,
  InMemoryBenchmarkPerformanceRecordStore,
} from "../src/platform/providers/routing/performance/benchmark";

async function main(): Promise<void> {
  const service = process.argv.includes("--service")
    ? process.argv[process.argv.indexOf("--service") + 1] ?? "social"
    : "social";
  const industry = process.argv.includes("--industry")
    ? process.argv[process.argv.indexOf("--industry") + 1]
    : "fashion";

  const routing = loadAdaptiveRoutingConfig(process.env);
  const modelPlatform = createModelRegistryPlatform({ loadSeed: true });
  const compatibilityEngine = new DefaultCompatibilityEngine();
  const providerRegistry = new InMemoryProviderRuntimeRegistry();
  for (const providerId of ["provider.openai", "provider.anthropic"] as const) {
    providerRegistry.registerExecutable({
      providerId: asProviderId(providerId),
      dispatcher: new ControllableDispatcher(),
      status: "available",
      capabilities: ["text.generate"],
    });
  }

  const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
  const platform = composeAdaptiveRoutingPlatform({
    env: process.env,
    providerRegistry,
    modelRegistry: modelPlatform.registry,
    compatibilityEngine,
    recordStore,
    useMongoPersistence: false,
  });

  const query = createAdaptiveRoutingQueryService({
    recordStore,
    policyStore: platform.policyStore,
    decisionStore: platform.decisionStore,
    rollbackStore: platform.rollbackStore,
    env: process.env,
    providerRegistry,
    modelRegistry: modelPlatform.registry,
    compatibilityEngine,
  });

  const staticRoute = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    strategyId: "strategy.baseline",
    strategyVersion: "1.0.0",
  });

  const policies = await query.getActiveAdaptivePolicies();
  const matching = selectMatchingPolicy(
    policies,
    Object.freeze({ service, subtype: "copywriting", industry }),
    () => new Date().toISOString(),
  );

  const capability = matching
    ? verifyAdaptiveCandidateCapability({
        context: Object.freeze({
          providerId: matching.candidate.providerId,
          modelId: matching.candidate.modelId,
          capabilityId: "text.generate",
          service,
          subtype: "copywriting",
        }),
        providerRegistry,
        modelRegistry: modelPlatform.registry,
        compatibilityEngine,
      })
    : undefined;

  const decision = await resolveAdaptiveRoutingDecision(
    Object.freeze({
      requestId: "diag_request_step13",
      executionId: "diag_exec_step13",
      organizationId: "org_diag",
      capabilityId: "text.generate",
      scope: Object.freeze({ service, subtype: "copywriting", industry }),
      actual: staticRoute,
    }),
    platform.decisionDeps,
  );

  const guardrailsPass =
    decision.reason !== "COST_RISK" &&
    decision.reason !== "LATENCY_RISK" &&
    decision.reason !== "RELIABILITY_RISK" &&
    decision.reason !== "SAFETY_GUARD" &&
    decision.reason !== "INVALID_POLICY";

  console.log("=".repeat(60));
  console.log("STEP 13 — ADAPTIVE ROUTING READINESS (DRY RUN)");
  console.log("=".repeat(60));
  console.log(`ADAPTIVE ROUTING: ${routing.adaptiveRoutingEnabled ? "ENABLED" : "DISABLED"}`);
  console.log(`STATIC ROUTE: ${staticRoute.providerId}/${staticRoute.modelId}`);
  console.log(
    `MATCHING POLICY: ${matching ? `${matching.policyId}@${matching.policyVersion} (${matching.lifecycle})` : "none"}`,
  );
  console.log(
    `CANDIDATE: ${
      matching
        ? `${matching.candidate.providerId}/${matching.candidate.modelId}`
        : decision.adaptive
          ? `${decision.adaptive.providerId}/${decision.adaptive.modelId}`
          : "none"
    }`,
  );
  console.log(`CAPABILITY: ${capability ? (capability.executable ? "PASS" : "FAIL") : "N/A"}`);
  if (capability && !capability.executable) {
    console.log(`  reasons: ${capability.reasons.join("; ")}`);
  }
  console.log(
    `EVIDENCE: samples=${decision.evidence.validComparisonSamples} confidence=${decision.evidence.confidence}`,
  );
  console.log(`CONFIDENCE: ${decision.evidence.confidence}`);
  console.log(`GUARDRAILS: ${guardrailsPass ? "PASS" : "FAIL"} (${decision.reason})`);
  console.log(
    `ROLLOUT: ${decision.rolloutSelected ? "WOULD_SELECT" : "WOULD_KEEP_EXISTING"} (${decision.rolloutPercentage ?? "n/a"}%)`,
  );
  console.log(`FINAL DECISION: ${decision.decision} (${decision.reason})`);

  console.log("\n--- Pilot template (inactive) ---");
  console.log(JSON.stringify(ADAPTIVE_PILOT_TEMPLATE, null, 2));

  const health = await query.getAdaptiveRoutingHealth();
  console.log("\n--- Routing health ---");
  console.log(JSON.stringify(health, null, 2));
  console.log("\nNo provider calls made. No routing pins applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
