/**
 * Benchmark coverage audit — full service/output matrix coverage.
 */

import { enumerateServiceKeys } from "../../../../../os/contracts/output-contracts/composer";
import { defaultServiceOutputContractRegistry } from "../../../../../os/contracts/output-contracts/service-contract-registry";
import { SOCIAL_FORMAT_IDS } from "../../../../../os/contracts/output-contracts/format-overlays";
import {
  buildBenchmarkCatalog,
  buildBenchmarkSuites,
  listBenchmarkCases,
} from "../catalog/benchmark-catalog";
import { BENCHMARK_SYSTEM_VERSION } from "../contracts/benchmark-case";

export type BenchmarkCoverageStatus =
  | "benchmarkable"
  | "awaiting_benchmark_case"
  | "unsupported";

export type BenchmarkCoverageEntry = {
  readonly serviceKey: string;
  readonly outputKind: string;
  readonly benchmarkCaseIds: readonly string[];
  readonly status: BenchmarkCoverageStatus;
  readonly reason?: string;
};

export type BenchmarkCoverageReport = {
  readonly version: typeof BENCHMARK_SYSTEM_VERSION;
  readonly totalEntries: number;
  readonly benchmarkable: number;
  readonly awaitingBenchmarkCase: number;
  readonly unsupported: number;
  readonly entries: readonly BenchmarkCoverageEntry[];
  readonly catalogCaseCount: number;
  readonly suiteCount: number;
};

function taxonomyServiceKeys(): string[] {
  const keys = [...enumerateServiceKeys()];
  for (const formatId of SOCIAL_FORMAT_IDS) {
    keys.push(`social/content-design/*/${formatId}`);
  }
  return keys;
}

function benchmarkCasesForServiceKey(
  serviceKey: string,
  catalog: ReturnType<typeof buildBenchmarkCatalog>,
): readonly string[] {
  if (serviceKey.includes("/*/")) {
    const formatId = serviceKey.split("/").pop()!;
    return catalog
      .filter((c) => c.service === "social" && c.subtype === "content-design" && c.format === formatId)
      .map((c) => c.benchmarkId);
  }
  const [service, subtype] = serviceKey.split("/");
  if (!service || !subtype) return [];
  return catalog
    .filter((c) => c.service === service && c.subtype === subtype && !c.format)
    .map((c) => c.benchmarkId);
}

export function auditBenchmarkCoverage(): BenchmarkCoverageReport {
  const catalog = buildBenchmarkCatalog();
  const entries: BenchmarkCoverageEntry[] = [];

  for (const serviceKey of taxonomyServiceKeys()) {
    let contract;
    if (serviceKey.includes("/*/")) {
      const formatId = serviceKey.split("/").pop()!;
      contract = defaultServiceOutputContractRegistry.getServiceContract(
        "social",
        "content-design",
        { format: formatId, platform: "instagram" },
      );
    } else {
      const [service, subtype] = serviceKey.split("/");
      contract = service && subtype
        ? defaultServiceOutputContractRegistry.getContractForServiceKey(`${service}/${subtype}`)
        : undefined;
    }

    const caseIds = benchmarkCasesForServiceKey(serviceKey, catalog);

    let status: BenchmarkCoverageStatus;
    let reason: string | undefined;

    if (!contract) {
      status = "unsupported";
      reason = "No output contract registered";
    } else if (caseIds.length > 0) {
      status = "benchmarkable";
    } else {
      status = "awaiting_benchmark_case";
      reason = "Framework supports benchmarking; representative case not yet authored";
    }

    entries.push(
      Object.freeze({
        serviceKey,
        outputKind: contract?.outputKind ?? "unknown",
        benchmarkCaseIds: Object.freeze(caseIds),
        status,
        reason,
      }),
    );
  }

  const benchmarkable = entries.filter((e) => e.status === "benchmarkable").length;
  const awaiting = entries.filter((e) => e.status === "awaiting_benchmark_case").length;
  const unsupported = entries.filter((e) => e.status === "unsupported").length;

  return Object.freeze({
    version: BENCHMARK_SYSTEM_VERSION,
    totalEntries: entries.length,
    benchmarkable,
    awaitingBenchmarkCase: awaiting,
    unsupported,
    entries: Object.freeze(entries),
    catalogCaseCount: catalog.length,
    suiteCount: buildBenchmarkSuites().length,
  });
}

export function assertFullBenchmarkCoverage(): void {
  const report = auditBenchmarkCoverage();
  if (report.unsupported > 0) {
    const unsupported = report.entries.filter((e) => e.status === "unsupported");
    throw new Error(
      `Benchmark coverage audit failed: ${report.unsupported} unsupported entries: ${unsupported.map((e) => e.serviceKey).join(", ")}`,
    );
  }
}

export function listAwaitingBenchmarkCases(): readonly BenchmarkCoverageEntry[] {
  return auditBenchmarkCoverage().entries.filter(
    (e) => e.status === "awaiting_benchmark_case",
  );
}

export function benchmarkCasesForService(serviceKey: string): readonly string[] {
  const [service, subtype] = serviceKey.split("/");
  if (!service || !subtype) return [];
  return listBenchmarkCases({ service, enabled: true }).map((c) => c.benchmarkId);
}
