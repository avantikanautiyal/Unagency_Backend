/**
 * Step 3 — Canonical benchmark case model.
 * References Step 1 service/output contracts — does not duplicate taxonomy.
 */

export const BENCHMARK_SYSTEM_VERSION = "1.0.0" as const;

export type BenchmarkComplexity = "low" | "medium" | "high";

export type BenchmarkCase = {
  readonly benchmarkId: string;
  readonly version: typeof BENCHMARK_SYSTEM_VERSION;
  readonly suiteId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly complexity: BenchmarkComplexity;
  readonly objective: string;
  readonly inputBrief: string;
  readonly contractReference: {
    readonly serviceKey: string;
    readonly contractIdPrefix: string;
  };
  readonly expectedConstraints?: readonly string[];
  readonly evaluationProfile: "full_contract_validation";
  readonly enabled: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
};

export type BenchmarkSuite = {
  readonly suiteId: string;
  readonly label: string;
  readonly outputKinds: readonly string[];
  readonly caseIds: readonly string[];
};

export type BenchmarkExecutionConditions = {
  readonly benchmarkId: string;
  readonly benchmarkVersion: typeof BENCHMARK_SYSTEM_VERSION;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly evaluatorVersion: string;
  readonly validationVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
};

export type BenchmarkModelTarget = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly capabilityId: string;
};

export type BenchmarkStrategy = {
  readonly strategyId: string;
  readonly version: string;
  readonly label?: string;
};

export const DEFAULT_BENCHMARK_STRATEGY: BenchmarkStrategy = Object.freeze({
  strategyId: "benchmark.default",
  version: "1.0.0",
  label: "Default benchmark execution strategy",
});
