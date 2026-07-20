/**
 * Provider certification report — primary output.
 */

import type { CertificationReportId } from "./identifiers";
import type { CertificationRequest } from "./request";
import type { CertificationStatus } from "./enums";
import type { CertificationScorecard } from "./scorecard";
import type { CapabilityMatrix, ComplianceMatrix, PerformanceMatrix } from "./matrices";
import type { ProviderCertificationBadge } from "./badge";
import type { ProviderCompatibilityProfile, ProviderQualityReport } from "./profile";
import type {
  SuiteResult,
  FailureReport,
  ImprovementRecommendation,
} from "./suite-result";

export interface CertificationStatistics {
  readonly suitesRun: number;
  readonly suitesPassed: number;
  readonly suitesFailed: number;
  readonly totalDurationMs: number;
}

export interface ProviderCertificationReport {
  readonly reportId: CertificationReportId;
  readonly requestId: string;
  readonly providerId: string;
  readonly vendor: string;
  readonly status: CertificationStatus;
  readonly scorecard: CertificationScorecard;
  readonly capabilityMatrix: CapabilityMatrix;
  readonly complianceMatrix: ComplianceMatrix;
  readonly performanceMatrix: PerformanceMatrix;
  readonly compatibilityProfile: ProviderCompatibilityProfile;
  readonly qualityReport: ProviderQualityReport;
  readonly badge: ProviderCertificationBadge;
  readonly suiteResults: readonly SuiteResult[];
  readonly failureReport?: FailureReport;
  readonly recommendations: readonly ImprovementRecommendation[];
  readonly statistics: CertificationStatistics;
  readonly createdAt: string;
}
