/**
 * Step 4A — Controlled smoke-test run configuration (script layer).
 * Selects a small subset of pilot benchmarks and two cross-provider models.
 * Does not alter the global pilot catalog or benchmark engine defaults.
 */

import { getBenchmarkCase } from "../catalog/benchmark-catalog";
import { PILOT_BENCHMARK_IDS } from "../catalog/benchmark-pilot-catalog";
import {
  assertBenchmarkBudget,
  PILOT_BENCHMARK_BUDGET,
  planBenchmarkInvocations,
  type BenchmarkInvocationPlan,
  type BenchmarkRepeatConfig,
  DEFAULT_REPEAT_CONFIG,
} from "../contracts/benchmark-execution-config";
import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import { resolveExecutableModelId } from "../../failover/executable-model-id";

/** Representative pilot subset — diverse UnAgency task types within the 12-call budget. */
export const SMOKE_DEFAULT_BENCHMARK_IDS = Object.freeze([
  "bench.website.landing-page",
  "bench.website.landing-page.healthcare",
  "bench.presentations.pitch-decks",
  "bench.print.brochures",
  "bench.social.copywriting",
  "bench.website.corporate-website.complex",
] as const);

export type SmokeModelSpec = {
  readonly providerId: string;
  readonly modelId: string;
};

export const SMOKE_DEFAULT_MODEL_SPECS: readonly SmokeModelSpec[] = Object.freeze([
  Object.freeze({ providerId: "provider.openai", modelId: "openai/gpt-4o" }),
  Object.freeze({ providerId: "provider.anthropic", modelId: "anthropic/claude-sonnet-4-5" }),
]);

export type SmokeRunConfig = {
  readonly models: readonly BenchmarkModelTarget[];
  readonly benchmarkIds: readonly string[];
  readonly repeatConfig: BenchmarkRepeatConfig;
  readonly budget: typeof PILOT_BENCHMARK_BUDGET;
  readonly plan: BenchmarkInvocationPlan;
};

export type ConfiguredProviderRef = {
  readonly providerId: string;
  readonly enabled: boolean;
  readonly configured: boolean;
};

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseSmokeModelSpecsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly SmokeModelSpec[] {
  const raw = env.BENCHMARK_SMOKE_MODELS?.trim();
  if (!raw) return SMOKE_DEFAULT_MODEL_SPECS;

  const specs = parseCsv(raw).map((entry) => {
    const sep = entry.indexOf(":");
    if (sep <= 0) {
      throw new Error(
        `Invalid BENCHMARK_SMOKE_MODELS entry "${entry}". Expected providerId:modelId`,
      );
    }
    return Object.freeze({
      providerId: entry.slice(0, sep).trim(),
      modelId: entry.slice(sep + 1).trim(),
    });
  });

  if (specs.length !== 2) {
    throw new Error(
      `Smoke test requires exactly 2 model targets (got ${specs.length}). ` +
        `Set BENCHMARK_SMOKE_MODELS=provider.openai:openai/gpt-4o,provider.anthropic:anthropic/claude-sonnet-4-5`,
    );
  }

  const providers = new Set(specs.map((s) => s.providerId));
  if (providers.size !== 2) {
    throw new Error(
      "Smoke test requires two models from two different providers.",
    );
  }

  return Object.freeze(specs);
}

export function resolveSmokeBenchmarkIds(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const fromEnv = parseCsv(env.BENCHMARK_SMOKE_BENCHMARK_IDS);
  const ids = fromEnv.length > 0 ? fromEnv : [...SMOKE_DEFAULT_BENCHMARK_IDS];

  const pilotSet = new Set<string>(PILOT_BENCHMARK_IDS as readonly string[]);
  const invalidPilot = ids.filter((id) => !pilotSet.has(id));
  if (invalidPilot.length > 0) {
    throw new Error(
      `Smoke benchmark IDs must be a subset of the pilot catalog: ${invalidPilot.join(", ")}`,
    );
  }

  const missing = ids.filter((id) => !getBenchmarkCase(id));
  if (missing.length > 0) {
    throw new Error(`Benchmark cases not found in catalog: ${missing.join(", ")}`);
  }

  return Object.freeze(ids);
}

export function resolveSmokeModels(
  specs: readonly SmokeModelSpec[],
  readyProviders: readonly ConfiguredProviderRef[],
): readonly BenchmarkModelTarget[] {
  const readyById = new Map(
    readyProviders
      .filter((p) => p.enabled && p.configured)
      .map((p) => [p.providerId, p] as const),
  );

  return Object.freeze(
    specs.map((spec) => {
      if (!readyById.has(spec.providerId)) {
        throw new Error(
          `Smoke model provider not configured: ${spec.providerId}. ` +
            "Enable the provider and set its API key in .env.",
        );
      }
      const modelId = resolveExecutableModelId(spec.providerId, spec.modelId);
      return Object.freeze({
        providerId: spec.providerId,
        modelId,
        modelVersion: process.env.BENCHMARK_MODEL_VERSION,
        capabilityId: "text.generate",
      });
    }),
  );
}

export function buildSmokeRunConfig(input: {
  readonly readyProviders: readonly ConfiguredProviderRef[];
  readonly env?: NodeJS.ProcessEnv;
  readonly repeatConfig?: BenchmarkRepeatConfig;
}): SmokeRunConfig {
  const env = input.env ?? process.env;
  const modelSpecs = parseSmokeModelSpecsFromEnv(env);
  const models = resolveSmokeModels(modelSpecs, input.readyProviders);
  const benchmarkIds = resolveSmokeBenchmarkIds(env);
  const repeatConfig = input.repeatConfig ?? DEFAULT_REPEAT_CONFIG;

  const plan = planBenchmarkInvocations({
    benchmarkIds,
    models,
    repeatCount: repeatConfig.repeatCount,
    budget: PILOT_BENCHMARK_BUDGET,
  });

  assertBenchmarkBudget(plan, PILOT_BENCHMARK_BUDGET);

  return Object.freeze({
    models,
    benchmarkIds,
    repeatConfig,
    budget: PILOT_BENCHMARK_BUDGET,
    plan,
  });
}

export function formatSmokeExecutionPlan(config: SmokeRunConfig): string {
  const lines = [
    "Smoke execution plan (safe — no secrets):",
    "",
    "Selected providers:",
    ...config.models.map((m) => `  - ${m.providerId}`),
    "",
    "Selected model IDs:",
    ...config.models.map((m) => `  - ${m.modelId}`),
    "",
    "Selected benchmark IDs:",
    ...config.benchmarkIds.map((id) => `  - ${id}`),
    "",
    `Repeat count: ${config.plan.repeatCount}`,
    `Planned invocations: ${config.plan.totalInvocations}`,
    `Budget limit: ${config.budget.maxInvocations}`,
    `Within budget: ${config.plan.withinMaxInvocations}`,
  ];
  return lines.join("\n");
}
