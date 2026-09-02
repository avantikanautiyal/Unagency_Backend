/**
 * Priority 4.4 — Resolve benchmark cases for an evidence readiness scope.
 */

import type { BenchmarkCase } from "../../contracts/benchmark-case";
import { listBenchmarkCases } from "../../catalog/benchmark-catalog";
import type { EvidenceReadinessScope } from "../readiness/evidence-readiness-contract";

export function resolveBenchmarkCasesForScope(
  scope: EvidenceReadinessScope,
): readonly BenchmarkCase[] {
  const exact = listBenchmarkCases({
    service: scope.service,
    industry: scope.industry,
    outputKind: scope.modality,
    enabled: true,
  }).filter(
    (c) =>
      c.subtype === scope.subtype &&
      c.complexity === scope.complexity &&
      (scope.industry ? c.industry === scope.industry : true),
  );
  if (exact.length > 0) return Object.freeze(exact);

  const byServiceSubtype = listBenchmarkCases({
    service: scope.service,
    outputKind: scope.modality,
    enabled: true,
  }).filter((c) => c.subtype === scope.subtype && c.complexity === scope.complexity);
  if (byServiceSubtype.length > 0) return Object.freeze(byServiceSubtype);

  const byService = listBenchmarkCases({ service: scope.service, enabled: true }).filter(
    (c) => c.subtype === scope.subtype,
  );
  return Object.freeze(byService);
}

export function pickPrimaryBenchmarkCase(
  scope: EvidenceReadinessScope,
): BenchmarkCase | undefined {
  const cases = resolveBenchmarkCasesForScope(scope);
  return cases[0];
}
