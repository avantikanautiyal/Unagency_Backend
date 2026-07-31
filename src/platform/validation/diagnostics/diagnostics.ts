/**
 * Validation diagnostics — summarize failures across a run.
 */

import type { ValidationCheck, ValidationRunReport } from "../contracts";

export interface ValidationDiagnostics {
  readonly failedChecks: readonly ValidationCheck[];
  readonly warnChecks: readonly ValidationCheck[];
  readonly failedScenarios: readonly string[];
  readonly summary: string;
}

export function analyzeValidationRun(report: ValidationRunReport): ValidationDiagnostics {
  const failedChecks = report.checks.filter((c) => c.status === "fail");
  const warnChecks = report.checks.filter((c) => c.status === "warn");
  const failedScenarios = report.scenarios.filter((s) => !s.success).map((s) => s.scenarioId);
  const summary =
    failedChecks.length === 0
      ? `Validation run ${report.runId} passed (${report.scenarios.length} scenarios)`
      : `Validation run ${report.runId} has ${failedChecks.length} failed checks`;
  return { failedChecks, warnChecks, failedScenarios, summary };
}
