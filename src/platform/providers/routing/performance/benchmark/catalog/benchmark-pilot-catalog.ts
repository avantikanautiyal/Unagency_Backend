/**
 * Step 4A — Controlled pilot benchmark catalog.
 * Representative tasks across output kinds, industries, and complexity.
 */

import { getBenchmarkCase } from "../catalog/benchmark-catalog";
import type { BenchmarkCase } from "../contracts/benchmark-case";

/** Pilot benchmark IDs — meaningful UnAgency tasks, not trivial prompts. */
export const PILOT_BENCHMARK_IDS = Object.freeze([
  // Website — multiple industries + complexity
  "bench.website.landing-page",
  "bench.website.landing-page.fashion",
  "bench.website.landing-page.healthcare",
  "bench.website.corporate-website.complex",
  // Presentation
  "bench.presentations.pitch-decks",
  "bench.presentations.pitch-decks.technology",
  // Document / print
  "bench.print.brochures",
  // Image / branding
  "bench.branding.logo-design",
  "bench.branding.logo-design.fashion",
  // Content
  "bench.social.copywriting",
  // Social format (image output kind)
  "bench.social.content-design.fmt.feed-post",
] as const);

export type PilotBenchmarkId = (typeof PILOT_BENCHMARK_IDS)[number];

export function getPilotBenchmarkCases(): readonly BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  for (const id of PILOT_BENCHMARK_IDS) {
    const c = getBenchmarkCase(id);
    if (c) cases.push(c);
  }
  return Object.freeze(cases);
}

export function assertPilotBenchmarksAvailable(): void {
  const missing = PILOT_BENCHMARK_IDS.filter((id) => !getBenchmarkCase(id));
  if (missing.length > 0) {
    throw new Error(`Pilot benchmarks missing from catalog: ${missing.join(", ")}`);
  }
}

export const PILOT_SUITE_ID = "suite.pilot" as const;

export function pilotBenchmarkIdsForModality(modality: "text" | "image" | "all"): readonly string[] {
  const cases = getPilotBenchmarkCases();
  if (modality === "all") return PILOT_BENCHMARK_IDS;
  return cases
    .filter((c) => {
      const kind = c.outputKind.toLowerCase();
      if (modality === "image") {
        return kind.includes("image") || kind === "image";
      }
      return !kind.includes("image") && kind !== "video" && kind !== "animation";
    })
    .map((c) => c.benchmarkId);
}
