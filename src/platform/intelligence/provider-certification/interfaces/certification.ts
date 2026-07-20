/**
 * Certification engine and suite interfaces.
 */

import type { Result } from "../../shared/result";
import type { CertificationRequest } from "../contracts/request";
import type { ProviderCertificationReport } from "../contracts/result";
import type { CertificationHarness } from "../fixtures/harness";
import type { SuiteResult } from "../contracts/suite-result";

export interface ICertificationSuite {
  readonly name: string;
  run(harness: CertificationHarness): Result<SuiteResult>;
}

export interface IProviderCertificationEngine {
  certify(request: CertificationRequest): Promise<Result<ProviderCertificationReport>>;
}

export interface IScorecardBuilder {
  build(suiteResults: readonly SuiteResult[]): import("../contracts/scorecard").CertificationScorecard;
}

export interface IBadgeIssuer {
  issue(
    report: ProviderCertificationReport
  ): import("../contracts/badge").ProviderCertificationBadge;
}

export interface IMatrixBuilder {
  buildCapabilityMatrix(
    harness: CertificationHarness,
    suiteResults: readonly SuiteResult[]
  ): import("../contracts/matrices").CapabilityMatrix;
  buildComplianceMatrix(
    suiteResults: readonly SuiteResult[]
  ): import("../contracts/matrices").ComplianceMatrix;
  buildPerformanceMatrix(
    benchmarks: readonly import("../contracts/benchmarks").BenchmarkScenario[]
  ): import("../contracts/matrices").PerformanceMatrix;
}
