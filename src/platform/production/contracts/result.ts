/**
 * Production validation request / report contracts.
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { ProductionExecutionMode } from "./enums";
import type { ProductionScenario } from "./scenario";
import type {
  BenchmarkResult,
  CertificationVerdict,
  FailureAnalysis,
  ProductionExecutionTrace,
  ProductionReadinessScore,
  ValidationCheckResult,
} from "./metrics";

export interface ProductionValidationRequest {
  readonly requestId: string;
  readonly scenarioId?: string;
  /** Inline scenario override — defaults to library lookup by scenarioId. */
  readonly scenario?: ProductionScenario;
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly mode?: ProductionExecutionMode;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProductionValidationReport {
  readonly validationId: string;
  readonly requestId: string;
  readonly scenario: ProductionScenario;
  readonly executionMode: ProductionExecutionMode;
  readonly providerMode: "live" | "simulated";
  readonly success: boolean;
  readonly checks: readonly ValidationCheckResult[];
  readonly passedCheckCount: number;
  readonly failedCheckCount: number;
  readonly warnCheckCount: number;
  readonly benchmark: BenchmarkResult;
  readonly certifications: readonly CertificationVerdict[];
  readonly readiness: ProductionReadinessScore;
  readonly failureAnalysis: FailureAnalysis;
  readonly executionTrace: ProductionExecutionTrace;
  readonly integration?: IntelligenceOsIntegrationReport;
  readonly selectedProvider?: string;
  readonly selectedModel?: string;
  readonly selectedCapabilities: readonly string[];
  readonly durationMs: number;
  readonly createdAt: string;
  readonly version: string;
}

export interface ProductionSuiteRequest {
  readonly requestId: string;
  readonly scenarioIds?: readonly string[];
  readonly mode?: ProductionExecutionMode;
  readonly stopOnFirstFailure?: boolean;
}

export interface ProductionSuiteReport {
  readonly suiteId: string;
  readonly requestId: string;
  readonly results: readonly ProductionValidationReport[];
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly averageReadiness: number;
  readonly durationMs: number;
  readonly createdAt: string;
}
