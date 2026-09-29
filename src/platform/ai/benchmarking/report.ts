/**
 * Phase 18 — Legacy vs canonical comparison + aggregation reporting.
 * Architectural properties only — no subjective rankings or text equality.
 */

import type {
  BenchmarkComparison,
  BenchmarkMetric,
  BenchmarkResult,
} from "./types";

export function compareLegacyVsCanonical(input: {
  readonly caseId: string;
  readonly legacy?: BenchmarkResult;
  readonly canonical?: BenchmarkResult;
}): BenchmarkComparison {
  const deltas: BenchmarkMetric[] = [];
  const leg = input.legacy;
  const can = input.canonical;

  const pushDelta = (
    id: string,
    legacyVal: boolean | number | string | null,
    canonicalVal: boolean | number | string | null,
    availability: BenchmarkMetric["availability"] = "available",
  ) => {
    deltas.push({
      id,
      category: "meta",
      value: `${String(legacyVal)}→${String(canonicalVal)}`,
      availability,
      detail: "legacy_vs_canonical",
    });
  };

  if (leg && can) {
    pushDelta(
      "delta.context.allExpectedPresent",
      leg.context.allExpectedPresent,
      can.context.allExpectedPresent,
    );
    pushDelta(
      "delta.artifact.exactVersion",
      leg.artifact.exactVersionPresent === "n/a"
        ? null
        : leg.artifact.exactVersionPresent,
      can.artifact.exactVersionPresent === "n/a"
        ? null
        : can.artifact.exactVersionPresent,
      leg.artifact.exactVersionPresent === "n/a" &&
        can.artifact.exactVersionPresent === "n/a"
        ? "not_applicable"
        : "available",
    );
    pushDelta(
      "delta.structured.ok",
      leg.structured.structuredOk,
      can.structured.structuredOk,
    );
    pushDelta(
      "delta.output_qa.status",
      leg.outputQa.status === "n/a" ? null : leg.outputQa.status,
      can.outputQa.status === "n/a" ? null : can.outputQa.status,
      leg.outputQa.status === "n/a" && can.outputQa.status === "n/a"
        ? "not_applicable"
        : "available",
    );
    pushDelta(
      "delta.latency.totalMs",
      leg.latency.totalMs ?? null,
      can.latency.totalMs ?? null,
      leg.latency.totalMs == null && can.latency.totalMs == null
        ? "unavailable"
        : "available",
    );
    pushDelta(
      "delta.usage.totalTokens",
      leg.usage.totalTokens ?? null,
      can.usage.totalTokens ?? null,
      leg.usage.totalTokens == null && can.usage.totalTokens == null
        ? "unavailable"
        : "available",
    );
    pushDelta(
      "delta.repair.required",
      false,
      can.repair.applicable && can.outputQa.status === "INVALID",
    );
  }

  return {
    caseId: input.caseId,
    legacy: leg,
    canonical: can,
    deltas,
    focus: "architectural_properties",
    textEqualityRequired: false,
  };
}

export type BenchmarkAggregation = {
  readonly byService: Readonly<
    Record<
      string,
      {
        readonly pass: number;
        readonly fail: number;
        readonly unsupported: number;
        readonly skipped: number;
        readonly error: number;
      }
    >
  >;
  readonly byPhase: Readonly<
    Record<string, { readonly pass: number; readonly fail: number; readonly unsupported: number }>
  >;
  readonly byScenario: Readonly<
    Record<string, { readonly pass: number; readonly fail: number; readonly unsupported: number }>
  >;
  readonly byProvider: Readonly<
    Record<string, { readonly count: number; readonly pass: number }>
  >;
  readonly byQaStatus: Readonly<Record<string, number>>;
  readonly byFailureCode: Readonly<Record<string, number>>;
  readonly subjectiveRanking: false;
  readonly autoEnabledFlags: false;
};

export function aggregateBenchmarkResults(
  results: readonly BenchmarkResult[],
): BenchmarkAggregation {
  const byService: Record<
    string,
    {
      pass: number;
      fail: number;
      unsupported: number;
      skipped: number;
      error: number;
    }
  > = {};
  const byPhase: Record<
    string,
    { pass: number; fail: number; unsupported: number }
  > = {};
  const byScenario: Record<
    string,
    { pass: number; fail: number; unsupported: number }
  > = {};
  const byProvider: Record<string, { count: number; pass: number }> = {};
  const byQaStatus: Record<string, number> = {};
  const byFailureCode: Record<string, number> = {};

  const bump = (
    map: Record<string, { pass: number; fail: number; unsupported: number }>,
    key: string,
    status: BenchmarkResult["status"],
  ) => {
    if (!map[key]) map[key] = { pass: 0, fail: 0, unsupported: 0 };
    if (status === "PASS") map[key].pass += 1;
    else if (status === "UNSUPPORTED") map[key].unsupported += 1;
    else if (status === "FAIL") map[key].fail += 1;
  };

  for (const r of results) {
    const svc = r.run.serviceId;
    if (!byService[svc]) {
      byService[svc] = {
        pass: 0,
        fail: 0,
        unsupported: 0,
        skipped: 0,
        error: 0,
      };
    }
    if (r.status === "PASS") byService[svc].pass += 1;
    else if (r.status === "FAIL") byService[svc].fail += 1;
    else if (r.status === "UNSUPPORTED") byService[svc].unsupported += 1;
    else if (r.status === "SKIPPED") byService[svc].skipped += 1;
    else byService[svc].error += 1;

    bump(byPhase, `${r.run.serviceId}/${r.run.phaseId}`, r.status);
    bump(byScenario, r.run.scenario, r.status);

    const provider = r.run.providerId ?? r.usage.providerId ?? "unknown";
    if (!byProvider[provider]) byProvider[provider] = { count: 0, pass: 0 };
    byProvider[provider].count += 1;
    if (r.status === "PASS") byProvider[provider].pass += 1;

    const qa = String(r.outputQa.status);
    byQaStatus[qa] = (byQaStatus[qa] ?? 0) + 1;
    for (const code of r.outputQa.codes) {
      byFailureCode[code] = (byFailureCode[code] ?? 0) + 1;
    }
  }

  return {
    byService,
    byPhase,
    byScenario,
    byProvider,
    byQaStatus,
    byFailureCode,
    subjectiveRanking: false,
    autoEnabledFlags: false,
  };
}

/** Safe report object — identities/counts only. */
export function buildBenchmarkReport(results: readonly BenchmarkResult[]): {
  readonly contractVersion: string;
  readonly resultCount: number;
  readonly aggregation: BenchmarkAggregation;
  readonly results: readonly {
    readonly caseId: string;
    readonly scenario: string;
    readonly status: string;
    readonly actionId: string;
    readonly actionVersion: string;
    readonly qaStatus: string;
    readonly repairInvalidToValid?: boolean;
  }[];
} {
  return {
    contractVersion: "18.0.0",
    resultCount: results.length,
    aggregation: aggregateBenchmarkResults(results),
    results: results.map((r) => ({
      caseId: r.run.caseId,
      scenario: r.run.scenario,
      status: r.status,
      actionId: r.run.actionId,
      actionVersion: r.run.actionVersion,
      qaStatus: String(r.outputQa.status),
      repairInvalidToValid: r.repair.invalidToValid,
    })),
  };
}
