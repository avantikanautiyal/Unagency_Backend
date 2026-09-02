/**
 * Step 4B — Control benchmark catalog references.
 * Uses existing benchmark catalog entries — no duplicate taxonomy.
 */

import { getBenchmarkCase } from "./benchmark-catalog";
import type { BenchmarkCase } from "../contracts/benchmark-case";
import { resolveBenchmarkValidity } from "../engine/benchmark-validity-model";
import type { BenchmarkValiditySpec } from "../engine/benchmark-validity-model";

export type ControlBenchmarkClass =
  | "control_text"
  | "control_structured"
  | "control_artifact"
  | "control_tool_enabled";

export type ControlBenchmarkRef = {
  readonly benchmarkId: string;
  readonly controlClass: ControlBenchmarkClass;
  readonly description: string;
  readonly validity: BenchmarkValiditySpec;
};

export const CONTROL_BENCHMARK_REFS: readonly ControlBenchmarkRef[] = Object.freeze([
  ref("bench.social.copywriting", "control_text", "Text-only social copy — fair text model comparison"),
  ref(
    "bench.print.brochures",
    "control_structured",
    "Structured document JSON — partial execution (text_prompt only)",
  ),
  ref(
    "bench.website.landing-page",
    "control_structured",
    "Deferred website WebProject — requires OS artifact pipeline (not pure model test)",
  ),
  ref(
    "bench.presentations.pitch-decks",
    "control_structured",
    "Presentation routes JSON — requires presentation artifact pipeline",
  ),
  ref(
    "bench.branding.logo-design",
    "control_artifact",
    "Image generation — requires image.generate capable model",
  ),
]);

function ref(
  benchmarkId: string,
  controlClass: ControlBenchmarkClass,
  description: string,
): ControlBenchmarkRef {
  const bc = getBenchmarkCase(benchmarkId);
  if (!bc) {
    throw new Error(`Control benchmark missing from catalog: ${benchmarkId}`);
  }
  return Object.freeze({
    benchmarkId,
    controlClass,
    description,
    validity: resolveBenchmarkValidity(bc),
  });
}

/** Step 5 calibration run — 1 text + 1 OS-executable artifact benchmark within budget. */
export const CALIBRATION_DEFAULT_BENCHMARK_IDS = Object.freeze([
  "bench.social.copywriting",
  "bench.print.brochures",
] as const);

export function getCalibrationBenchmarkCases(): readonly BenchmarkCase[] {
  return CALIBRATION_DEFAULT_BENCHMARK_IDS.map((id) => {
    const c = getBenchmarkCase(id);
    if (!c) throw new Error(`Calibration benchmark missing: ${id}`);
    return c;
  });
}

export function classifyBenchmarkComparability(benchmarkId: string): {
  readonly validForPureModelComparison: boolean;
  readonly reason: string;
} {
  const bc = getBenchmarkCase(benchmarkId);
  if (!bc) {
    return Object.freeze({ validForPureModelComparison: false, reason: "Unknown benchmark" });
  }
  const validity = resolveBenchmarkValidity(bc);
  return Object.freeze({
    validForPureModelComparison: validity.validForPureModelComparison,
    reason: validity.architectureNote,
  });
}
