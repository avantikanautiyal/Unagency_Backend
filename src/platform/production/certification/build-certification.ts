/**
 * Certification verdicts + production readiness score.
 */

import type {
  CertificationVerdict,
  ProductionReadinessScore,
  ValidationCheckResult,
} from "../contracts/metrics";
import type { BenchmarkResult } from "../contracts/metrics";

function areaScore(checks: readonly ValidationCheckResult[], area: string): number {
  const subset = checks.filter((c) => c.area === area);
  if (!subset.length) return 0.5;
  const pass = subset.filter((c) => c.status === "pass" || c.status === "warn").length;
  return pass / subset.length;
}

function grade(overall: number): ProductionReadinessScore["grade"] {
  if (overall >= 0.9) return "A";
  if (overall >= 0.8) return "B";
  if (overall >= 0.7) return "C";
  if (overall >= 0.55) return "D";
  return "F";
}

export function buildCertifications(
  checks: readonly ValidationCheckResult[],
  benchmark: BenchmarkResult,
  pipelineSuccess: boolean
): readonly CertificationVerdict[] {
  const executionScore = pipelineSuccess
    ? (areaScore(checks, "execution") + areaScore(checks, "benchmark")) / 2
    : 0;
  const providerScore = areaScore(checks, "provider");
  const capabilityScore = areaScore(checks, "capability");
  const workflowScore = (areaScore(checks, "workflow") + areaScore(checks, "consensus")) / 2;

  return [
    {
      area: "execution",
      passed: executionScore >= 0.7 && pipelineSuccess,
      score: executionScore,
      notes: [`pipeline=${pipelineSuccess}`, `latencyMs=${benchmark.executionLatencyMs}`],
    },
    {
      area: "provider",
      passed: providerScore >= 0.7,
      score: providerScore,
      notes: [`retries=${benchmark.retryCount}`, `cost=${benchmark.cost}`],
    },
    {
      area: "capability",
      passed: capabilityScore >= 0.7,
      score: capabilityScore,
      notes: ["capability plan present when check passed"],
    },
    {
      area: "workflow",
      passed: workflowScore >= 0.7,
      score: workflowScore,
      notes: ["agent plan + workflow artifacts"],
    },
    {
      area: "production_readiness",
      passed: false, // filled by readiness builder
      score: 0,
      notes: [],
    },
  ];
}

export function buildReadinessScore(
  checks: readonly ValidationCheckResult[],
  certifications: readonly CertificationVerdict[],
  pipelineSuccess: boolean
): { readiness: ProductionReadinessScore; certifications: CertificationVerdict[] } {
  const execution = certifications.find((c) => c.area === "execution")?.score ?? 0;
  const provider = certifications.find((c) => c.area === "provider")?.score ?? 0;
  const capability = certifications.find((c) => c.area === "capability")?.score ?? 0;
  const workflow = certifications.find((c) => c.area === "workflow")?.score ?? 0;

  const failWeight =
    checks.filter((c) => c.status === "fail").length * 0.05;
  const overall = Math.max(
    0,
    Math.min(
      1,
      (execution * 0.3 + provider * 0.25 + capability * 0.2 + workflow * 0.25) - failWeight
    )
  );

  const ready = pipelineSuccess && overall >= 0.75 && failWeight < 0.2;
  const readiness: ProductionReadinessScore = {
    overall,
    execution,
    provider,
    capability,
    workflow,
    grade: grade(overall),
    readyForProduction: ready,
  };

  const nextCerts = certifications.map((c) =>
    c.area === "production_readiness"
      ? {
          ...c,
          passed: ready,
          score: overall,
          notes: [`grade=${readiness.grade}`, `ready=${ready}`],
        }
      : c
  );

  return { readiness, certifications: nextCerts };
}
