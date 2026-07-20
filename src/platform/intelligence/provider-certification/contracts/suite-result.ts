/**
 * Per-suite certification results.
 */

import type { CertificationArea, SuiteOutcome } from "./enums";
import type { SuiteRunId } from "./identifiers";

export interface CertificationIssue {
  readonly code: string;
  readonly message: string;
  readonly area: CertificationArea;
  readonly severity: "error" | "warning" | "info";
}

export interface SuiteResult {
  readonly suiteRunId: SuiteRunId;
  readonly suiteName: string;
  readonly areas: readonly CertificationArea[];
  readonly outcome: SuiteOutcome;
  readonly score: number;
  readonly maxScore: number;
  readonly issues: readonly CertificationIssue[];
  readonly durationMs: number;
}

export interface FailureReport {
  readonly reportId: string;
  readonly failedAreas: readonly CertificationArea[];
  readonly criticalIssues: readonly CertificationIssue[];
  readonly summary: string;
}

export interface ImprovementRecommendation {
  readonly code: string;
  readonly area: CertificationArea;
  readonly priority: "high" | "medium" | "low";
  readonly recommendation: string;
}
