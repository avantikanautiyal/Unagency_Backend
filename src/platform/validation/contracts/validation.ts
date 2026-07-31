/**
 * Production Validation Platform contracts.
 */

import type {
  FailureSimulationKind,
  LoadProfileId,
  SecurityCheckId,
  ValidationCheckStatus,
  ValidationScenarioId,
  ValidationStageId,
} from "./enums";

export interface ValidationCheck {
  readonly checkId: string;
  readonly area: string;
  readonly status: ValidationCheckStatus;
  readonly message: string;
  readonly stageId?: ValidationStageId;
  readonly observed?: Readonly<Record<string, unknown>>;
  readonly expected?: Readonly<Record<string, unknown>>;
}

export interface StageValidationResult {
  readonly stageId: ValidationStageId;
  readonly name: string;
  readonly status: ValidationCheckStatus;
  readonly durationMs: number;
  readonly checks: readonly ValidationCheck[];
}

export interface ValidationScenarioDefinition {
  readonly scenarioId: ValidationScenarioId;
  readonly name: string;
  readonly description: string;
  readonly stages: readonly ValidationStageId[];
  readonly tags: readonly string[];
}

export interface ValidationRunRequest {
  readonly runId: string;
  readonly scenarioIds?: readonly ValidationScenarioId[];
  readonly includeFailureSimulation?: boolean;
  readonly includeLoadTesting?: boolean;
  readonly includeRecoveryTesting?: boolean;
  readonly includeSecurityValidation?: boolean;
  readonly loadProfile?: LoadProfileId;
  readonly organizationId?: string;
  readonly workspaceId?: string;
}

export interface LoadTestMetrics {
  readonly profile: LoadProfileId;
  readonly executionCount: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly queueWaitMs: number;
  readonly successRate: number;
  readonly providerLatencyMs: number;
}

export interface FailureSimulationResult {
  readonly kind: FailureSimulationKind;
  readonly expectedRecovery: string;
  readonly observedBehavior: string;
  readonly passed: boolean;
}

export interface RecoveryTestResult {
  readonly testId: string;
  readonly name: string;
  readonly passed: boolean;
  readonly notes: string;
}

export interface SecurityValidationResult {
  readonly checkId: SecurityCheckId;
  readonly passed: boolean;
  readonly message: string;
}

export interface CertificationDimension {
  readonly dimension: string;
  readonly scorePercent: number;
  readonly passed: boolean;
  readonly notes: readonly string[];
}

export interface ProductionReadinessCertification {
  readonly overallPercent: number;
  readonly grade: "A" | "B" | "C" | "D" | "F";
  readonly dimensions: readonly CertificationDimension[];
  readonly certifiedAt: string;
}

export interface CoverageSummary {
  readonly scenariosTotal: number;
  readonly scenariosPassed: number;
  readonly stagesTotal: number;
  readonly stagesValidated: number;
  readonly apisCovered: readonly string[];
  readonly modulesConsumed: readonly string[];
}

export interface ValidationRunReport {
  readonly runId: string;
  readonly success: boolean;
  readonly scenarios: readonly {
    readonly scenarioId: ValidationScenarioId;
    readonly success: boolean;
    readonly stages: readonly StageValidationResult[];
  }[];
  readonly checks: readonly ValidationCheck[];
  readonly failureSimulations: readonly FailureSimulationResult[];
  readonly loadMetrics?: LoadTestMetrics;
  readonly recoveryTests: readonly RecoveryTestResult[];
  readonly securityResults: readonly SecurityValidationResult[];
  readonly coverage: CoverageSummary;
  readonly certification: ProductionReadinessCertification;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface ValidationReportBundle {
  readonly runReport: ValidationRunReport;
  readonly validationReportMd: string;
  readonly endToEndReportMd: string;
  readonly securityReportMd: string;
  readonly loadTestReportMd: string;
  readonly failureReportMd: string;
  readonly recoveryReportMd: string;
  readonly performanceReportMd: string;
  readonly coverageReportMd: string;
  readonly certificationReportMd: string;
}
