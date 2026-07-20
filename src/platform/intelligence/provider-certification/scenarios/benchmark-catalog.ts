/**
 * Standard benchmark scenario catalog — interface compatibility only.
 */

import type { BenchmarkCatalog, BenchmarkScenario } from "../contracts/benchmarks";
import { BENCHMARK_SCENARIOS } from "../constants";

const SCENARIO_FEATURES: Record<string, readonly string[]> = {
  creative_writing: ["text.generate"],
  code_generation: ["text.generate", "reasoning"],
  reasoning: ["reasoning"],
  research: ["text.generate", "tool_calling"],
  translation: ["text.generate"],
  vision: ["vision"],
  image_generation: ["image.generate"],
  audio: ["audio"],
  video: ["video"],
  long_context: ["text.generate", "long_context"],
  json_extraction: ["json_mode", "structured_outputs"],
  tool_calling: ["tool_calling"],
  agent_collaboration: ["tool_calling", "reasoning"],
};

function buildScenario(kind: string): BenchmarkScenario {
  return Object.freeze({
    scenarioId: `bench_${kind}`,
    kind: kind as BenchmarkScenario["kind"],
    name: kind.replace(/_/g, " "),
    description: `Benchmark interface for ${kind}`,
    requiredFeatures: SCENARIO_FEATURES[kind] ?? [],
    inputShape: { type: "object" },
    expectedOutputShape: { type: "object" },
    compatible: true,
  });
}

export function buildBenchmarkCatalog(): BenchmarkCatalog {
  return Object.freeze({
    catalogId: "bench_catalog_v1",
    scenarios: BENCHMARK_SCENARIOS.map(buildScenario),
    version: "1.0.0",
  });
}

export function assessBenchmarkCompatibility(
  supportedFeatures: readonly string[],
  catalog: BenchmarkCatalog = buildBenchmarkCatalog()
): BenchmarkScenario[] {
  return catalog.scenarios.map((scenario) => {
    const compatible = scenario.requiredFeatures.every((f) =>
      supportedFeatures.some((sf) => sf.includes(f.replace("_", "")) || sf === f)
    );
    return { ...scenario, compatible };
  });
}
