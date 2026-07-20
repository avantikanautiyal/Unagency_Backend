/**
 * Benchmark scenario definitions — interface compatibility only.
 */

import type { BenchmarkScenarioKind } from "./enums";

export interface BenchmarkScenario {
  readonly scenarioId: string;
  readonly kind: BenchmarkScenarioKind;
  readonly name: string;
  readonly description: string;
  readonly requiredFeatures: readonly string[];
  readonly inputShape: Readonly<Record<string, unknown>>;
  readonly expectedOutputShape: Readonly<Record<string, unknown>>;
  readonly compatible: boolean;
}

export interface BenchmarkCatalog {
  readonly catalogId: string;
  readonly scenarios: readonly BenchmarkScenario[];
  readonly version: string;
}
