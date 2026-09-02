/**
 * Step 13 — Adaptive routing production safety + inactive pilot configuration.
 */

import { loadAdaptiveRoutingConfig } from "../../config/adaptive-routing-config";
import { DEFAULT_ROUTING_POLICY_GUARDRAILS } from "./routing-policy-contract";

/** Inactive pilot template — NOT auto-activated; operator must explicitly approve + activate. */
export const ADAPTIVE_PILOT_TEMPLATE = Object.freeze({
  label: "1% fashion social copywriting pilot",
  rolloutPercentage: 1,
  scope: Object.freeze({
    service: "social",
    subtype: "copywriting",
    industry: "fashion",
  }),
  minimumSamples: DEFAULT_ROUTING_POLICY_GUARDRAILS.minimumSamples,
  minimumConfidence: DEFAULT_ROUTING_POLICY_GUARDRAILS.minimumConfidence,
  maxCostIncrease: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxCostIncrease,
  maxLatencyIncrease: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxLatencyIncrease,
  maxReliabilityRegression: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxReliabilityRegression,
  maxQualityRegression: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxQualityRegression,
  /** Explicitly inactive until operator creates policy from template. */
  active: false,
});

export type AdaptiveRoutingSafetyState = {
  readonly globalEnabled: boolean;
  readonly persistenceAvailable: boolean;
  readonly failClosed: boolean;
};

export function resolveAdaptiveRoutingSafety(input?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly persistenceAvailable?: boolean;
}): AdaptiveRoutingSafetyState {
  const env = input?.env ?? process.env;
  const globalEnabled = loadAdaptiveRoutingConfig(env).adaptiveRoutingEnabled;
  const persistenceAvailable = input?.persistenceAvailable ?? false;
  return Object.freeze({
    globalEnabled,
    persistenceAvailable,
    failClosed: globalEnabled && !persistenceAvailable,
  });
}

export function adaptiveRoutingMustFailClosed(safety: AdaptiveRoutingSafetyState): boolean {
  return safety.failClosed;
}
