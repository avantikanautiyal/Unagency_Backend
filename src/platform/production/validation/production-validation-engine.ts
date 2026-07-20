/**
 * Production Validation Engine — execute OS → measure → validate → certify.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { IProductionValidationEngine } from "../interfaces/production";
import type {
  ProductionSuiteRequest,
  ProductionSuiteReport,
  ProductionValidationRequest,
  ProductionValidationReport,
} from "../contracts/result";
import { PRODUCTION_VALIDATION_VERSION } from "../constants";
import {
  getScenario,
  PRODUCTION_SCENARIO_LIBRARY,
} from "../scenarios/scenario-library";
import {
  bootProductionExecution,
  executeScenario,
  type ProductionExecutionContext,
  type ProductionExecutionDeps,
} from "../execution/production-executor";
import { collectValidationChecks } from "../validation/collect-checks";
import { collectBenchmark } from "../benchmarking/collect-benchmark";
import {
  buildCertifications,
  buildReadinessScore,
} from "../certification/build-certification";
import { analyzeFailure } from "../diagnostics/failure-analysis";
import { buildExecutionTrace } from "../observability/execution-trace";
import { InMemoryProductionReportStore } from "../reporting/report-store";
import type { BenchmarkResult } from "../contracts/metrics";

export interface ProductionValidationEngineDeps extends ProductionExecutionDeps {
  readonly reportStore?: InMemoryProductionReportStore;
}

export class ProductionValidationEngine implements IProductionValidationEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly store: InMemoryProductionReportStore;
  private ctx?: ProductionExecutionContext;
  private readonly bootDeps: ProductionExecutionDeps;

  constructor(deps: ProductionValidationEngineDeps = {}) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.store = deps.reportStore ?? new InMemoryProductionReportStore();
    this.bootDeps = deps;
  }

  getReportStore(): InMemoryProductionReportStore {
    return this.store;
  }

  async validate(
    request: ProductionValidationRequest
  ): Promise<Result<ProductionValidationReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }

    const scenario =
      request.scenario ??
      (request.scenarioId ? getScenario(request.scenarioId) : undefined) ??
      PRODUCTION_SCENARIO_LIBRARY[0];

    if (!scenario) {
      return failure(new ValidationError("scenario not found"));
    }

    const boot = await this.ensureContext(request.mode);
    if (!boot.ok) return boot;
    const ctx = boot.value;

    const correlationId =
      request.correlationId ?? this.createId("corr_prod");
    const integration = await executeScenario(
      ctx,
      scenario,
      request.requestId,
      correlationId,
      {
        organizationId: request.organizationId,
        workspaceId: request.workspaceId,
        budgetLimit: request.budgetLimit,
        tokenBudgetLimit: request.tokenBudgetLimit,
      }
    );

    if (!integration.ok) {
      const emptyBenchmark: BenchmarkResult = {
        providerLatencyMs: 0,
        executionLatencyMs: this.clockMs() - start,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        retryCount: 0,
        streamingChunkCount: 0,
        evaluationScore: 0,
        humanReviewRequired: true,
        capturedAt: this.nowIso(),
      };
      const checks = [
        {
          checkId: "integration_run",
          area: "execution",
          status: "fail" as const,
          message: integration.error.message,
        },
      ];
      const failureAnalysis = analyzeFailure(undefined, checks);
      const certs = buildCertifications(checks, emptyBenchmark, false);
      const { readiness, certifications } = buildReadinessScore(
        checks,
        certs,
        false
      );

      const report: ProductionValidationReport = {
        validationId: this.createId("pval"),
        requestId: request.requestId,
        scenario,
        executionMode: ctx.executionMode,
        providerMode: ctx.providerMode,
        success: false,
        checks,
        passedCheckCount: 0,
        failedCheckCount: 1,
        warnCheckCount: 0,
        benchmark: emptyBenchmark,
        certifications,
        readiness,
        failureAnalysis,
        executionTrace: {
          correlationId,
          requestId: request.requestId,
          stageTimings: [],
          bridgeTimings: [],
          providerTimings: { totalMs: 0, executionMs: 0, retries: 0 },
          artifactKeys: [],
          capturedAt: this.nowIso(),
        },
        selectedCapabilities: [],
        durationMs: this.clockMs() - start,
        createdAt: this.nowIso(),
        version: PRODUCTION_VALIDATION_VERSION,
      };
      this.store.save(report);
      return success(report);
    }

    const ios = integration.value;
    const checks = collectValidationChecks(ios, scenario, ctx.openai);
    const benchmark = collectBenchmark(ios, ctx.openai, this.nowIso);
    const failureAnalysis = analyzeFailure(ios, checks);
    const certs = buildCertifications(checks, benchmark, ios.success);
    const { readiness, certifications } = buildReadinessScore(
      checks,
      certs,
      ios.success
    );
    const executionTrace = buildExecutionTrace(ios, this.nowIso);

    const hardFails = checks.filter((c) => c.status === "fail");
    const successOverall = ios.success && hardFails.length === 0;

    const primary = ios.artifacts.modelIntelligence?.recommendation?.primary;
    const report: ProductionValidationReport = {
      validationId: this.createId("pval"),
      requestId: request.requestId,
      scenario,
      executionMode: ctx.executionMode,
      providerMode: ctx.providerMode,
      success: successOverall,
      checks,
      passedCheckCount: checks.filter((c) => c.status === "pass").length,
      failedCheckCount: hardFails.length,
      warnCheckCount: checks.filter((c) => c.status === "warn").length,
      benchmark,
      certifications,
      readiness,
      failureAnalysis,
      executionTrace,
      integration: ios,
      selectedProvider: primary?.providerId ?? "openai",
      selectedModel: primary ? String(primary.modelId) : undefined,
      selectedCapabilities: ios.artifacts.capability?.executionPlan?.capabilityIds ?? [],
      durationMs: this.clockMs() - start,
      createdAt: this.nowIso(),
      version: PRODUCTION_VALIDATION_VERSION,
    };

    this.store.save(report);
    return success(report);
  }

  async validateSuite(
    request: ProductionSuiteRequest
  ): Promise<Result<ProductionSuiteReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }

    const ids =
      request.scenarioIds ??
      PRODUCTION_SCENARIO_LIBRARY.map((s) => s.scenarioId);

    const results: ProductionValidationReport[] = [];
    for (const scenarioId of ids) {
      const one = await this.validate({
        requestId: `${request.requestId}_${scenarioId}`,
        scenarioId,
        mode: request.mode,
      });
      if (!one.ok) return one;
      results.push(one.value);
      if (request.stopOnFirstFailure && !one.value.success) break;
    }

    const passed = results.filter((r) => r.success).length;
    const averageReadiness =
      results.reduce((n, r) => n + r.readiness.overall, 0) /
      Math.max(1, results.length);

    return success({
      suiteId: this.createId("psuite"),
      requestId: request.requestId,
      results,
      total: results.length,
      passed,
      failed: results.length - passed,
      averageReadiness,
      durationMs: this.clockMs() - start,
      createdAt: this.nowIso(),
    });
  }

  private async ensureContext(
    mode?: ProductionValidationRequest["mode"]
  ): Promise<Result<ProductionExecutionContext>> {
    if (this.ctx && (!mode || mode === this.ctx.executionMode)) {
      return success(this.ctx);
    }
    const boot = await bootProductionExecution({
      ...this.bootDeps,
      mode: mode ?? this.bootDeps.mode,
      nowIso: this.nowIso,
      clockMs: this.clockMs,
      createId: this.createId,
    });
    if (!boot.ok) return boot;
    this.ctx = boot.value;
    return boot;
  }
}
