/**
 * Step 13.1 — Wire adaptive policy startup validation into enterprise boot.
 */

import type { EnterpriseApiPlatform } from "../factories/create-enterprise-api-platform";
import { bootstrapAdaptiveRoutingAtStartup } from "../../providers/routing/performance/benchmark/adaptive/create-adaptive-routing-platform";
import type { IModelRegistry } from "../../model-registry/interfaces/model-registry";
import type { ICompatibilityEngine } from "../../model-registry/interfaces/model-registry";
import { logAdaptiveMetric } from "../../providers/routing/performance/benchmark/adaptive/adaptive-routing-logger";
import { loadAdaptiveRoutingConfig } from "../../providers/routing/performance/config/adaptive-routing-config";

export type AdaptiveRoutingStartupResult = {
  readonly ran: boolean;
  readonly invalidCount: number;
  readonly reason?: string;
};

/**
 * Validate ACTIVE adaptive policies at startup when durable persistence is enabled.
 * Invalid policies are paused (fail closed) — they never influence routing.
 */
export async function runEnterpriseAdaptiveRoutingStartupValidation(
  platform: EnterpriseApiPlatform,
  input?: { readonly nowIso?: () => string },
): Promise<AdaptiveRoutingStartupResult> {
  const routing = loadAdaptiveRoutingConfig(process.env);
  if (routing.adaptiveRoutingEnabled) {
    console.warn(
      "[UNAGENCY-ADAPTIVE-ROUTING] startup | ADAPTIVE_ROUTING_ENABLED=true — validation runs but routing remains gated by policy guards",
    );
  }

  const adaptive = platform.adaptiveRoutingPlatform;
  if (!adaptive) {
    return Object.freeze({ ran: false, invalidCount: 0, reason: "adaptive_platform_unavailable" });
  }

  if (!platform.durableStores?.isDurable) {
    console.log(
      "[UNAGENCY-ADAPTIVE-ROUTING] startup | skipped (non-durable runtime — in-memory policies only)",
    );
    return Object.freeze({ ran: false, invalidCount: 0, reason: "non_durable_runtime" });
  }

  const providerRegistry = platform.providerRuntimeRegistry;
  const modelRegistry = platform.modelRegistry;
  const compatibilityEngine = platform.compatibilityEngine;
  if (!providerRegistry || !modelRegistry || !compatibilityEngine) {
    return Object.freeze({
      ran: false,
      invalidCount: 0,
      reason: "missing_registry_dependencies",
    });
  }

  const nowIso = input?.nowIso ?? (() => new Date().toISOString());
  const startup = await bootstrapAdaptiveRoutingAtStartup(adaptive, {
    providerRegistry,
    modelRegistry,
    compatibilityEngine,
    nowIso,
  });

  if (startup.invalidCount > 0) {
    logAdaptiveMetric("invalid_policy", {
      count: startup.invalidCount,
      phase: "startup_validation",
    });
    console.log(
      `[UNAGENCY-ADAPTIVE-ROUTING] startup | paused ${startup.invalidCount} invalid ACTIVE policy(ies)`,
    );
  } else {
    console.log("[UNAGENCY-ADAPTIVE-ROUTING] startup | all ACTIVE policies valid");
  }

  return Object.freeze({ ran: true, invalidCount: startup.invalidCount });
}
