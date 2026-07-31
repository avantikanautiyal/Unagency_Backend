/**
 * M9.5H — Adaptive routing + failover configuration.
 * Defaults preserve deterministic static routing; adaptive feedback is opt-in.
 */

export interface AdaptiveRoutingConfig {
  readonly adaptiveRoutingEnabled: boolean;
  readonly feedbackWeight: number;
  readonly minSamples: number;
  readonly windowDays: number;
  readonly explorationRate: number;
  readonly staticScoreFloor: number;
  readonly maxPerformanceContribution: number;
  readonly tenantOverlayEnabled: boolean;
}

export interface ProviderFailoverConfig {
  readonly failoverEnabled: boolean;
  readonly maxProviderAttempts: number;
  readonly maxFailovers: number;
  readonly maxTotalLatencyMs: number;
  readonly maxTokenBudget?: number;
  readonly maxCostBudget?: number;
  /** Async: max paid submit jobs per execution (conservative). */
  readonly maxSubmittedPaidJobs: number;
}

export interface M95HRuntimeConfig {
  readonly adaptive: AdaptiveRoutingConfig;
  readonly failover: ProviderFailoverConfig;
}

function envBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const v = env[key]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

function envNum(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadAdaptiveRoutingConfig(
  env: NodeJS.ProcessEnv = process.env
): AdaptiveRoutingConfig {
  return {
    adaptiveRoutingEnabled: envBool(env, "ADAPTIVE_ROUTING_ENABLED", false),
    feedbackWeight: Math.max(0, Math.min(1, envNum(env, "ADAPTIVE_ROUTING_FEEDBACK_WEIGHT", 0.25))),
    minSamples: Math.max(1, Math.floor(envNum(env, "ADAPTIVE_ROUTING_MIN_SAMPLES", 20))),
    windowDays: Math.max(1, Math.floor(envNum(env, "ADAPTIVE_ROUTING_WINDOW_DAYS", 30))),
    explorationRate: Math.max(
      0,
      Math.min(0.2, envNum(env, "ADAPTIVE_ROUTING_EXPLORATION_RATE", 0))
    ),
    staticScoreFloor: Math.max(0, Math.min(1, envNum(env, "ADAPTIVE_ROUTING_STATIC_FLOOR", 0.15))),
    maxPerformanceContribution: Math.max(
      0,
      Math.min(0.5, envNum(env, "ADAPTIVE_ROUTING_MAX_PERF_CONTRIBUTION", 0.35))
    ),
    tenantOverlayEnabled: envBool(env, "ADAPTIVE_ROUTING_TENANT_OVERLAY", true),
  };
}

export function loadProviderFailoverConfig(
  env: NodeJS.ProcessEnv = process.env
): ProviderFailoverConfig {
  return {
    failoverEnabled: envBool(env, "PROVIDER_FAILOVER_ENABLED", true),
    maxProviderAttempts: Math.max(
      1,
      Math.floor(envNum(env, "PROVIDER_FAILOVER_MAX_ATTEMPTS", 3))
    ),
    maxFailovers: Math.max(0, Math.floor(envNum(env, "PROVIDER_FAILOVER_MAX_FAILOVERS", 2))),
    maxTotalLatencyMs: Math.max(
      1_000,
      Math.floor(envNum(env, "PROVIDER_FAILOVER_MAX_LATENCY_MS", 120_000))
    ),
    maxTokenBudget: (() => {
      const n = envNum(env, "PROVIDER_FAILOVER_MAX_TOKEN_BUDGET", 0);
      return n > 0 ? n : undefined;
    })(),
    maxCostBudget: (() => {
      const n = envNum(env, "PROVIDER_FAILOVER_MAX_COST_BUDGET", 0);
      return n > 0 ? n : undefined;
    })(),
    maxSubmittedPaidJobs: Math.max(
      1,
      Math.floor(envNum(env, "PROVIDER_FAILOVER_MAX_SUBMITTED_PAID_JOBS", 2))
    ),
  };
}

export function loadM95HRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): M95HRuntimeConfig {
  return {
    adaptive: loadAdaptiveRoutingConfig(env),
    failover: loadProviderFailoverConfig(env),
  };
}
