/**
 * Validation Orchestrator — coordinates suites, engines, and reporting.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { IProductionValidationEngine } from "../../production/interfaces/production";
import type {
  ValidationReportBundle,
  ValidationRunReport,
  ValidationRunRequest,
} from "../contracts";
import type { IValidationOrchestrator } from "../interfaces/validation";
import { runFailureSimulations } from "../failure/failure-simulator";
import { runLoadProfile } from "../load/load-testing-engine";
import { runRecoveryTests } from "../recovery/recovery-testing-engine";
import { buildCoverageSummary } from "../coverage/coverage-engine";
import { buildCertification } from "../certification/certification-engine";
import { runSecurityValidation } from "../security/security-validation";
import { runHealthChecks } from "../health/health-checks";
import { buildReportBundle } from "../reports/report-writer";
import { setupEnterpriseApi, loginDemo, apiRequest } from "../../api/testing";
import {
  resolveScenarios,
  runValidationScenario,
  type ScenarioRunnerDeps,
} from "./scenario-runner";
import { mergeChecks } from "../assertions/assertion-framework";

export interface ValidationOrchestratorDeps {
  readonly productionEngine: IProductionValidationEngine;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ValidationOrchestrator implements IValidationOrchestrator {
  private readonly productionEngine: IProductionValidationEngine;
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(deps: ValidationOrchestratorDeps) {
    this.productionEngine = deps.productionEngine;
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
  }

  async run(request: ValidationRunRequest): Promise<Result<ValidationRunReport>> {
    const start = this.clockMs();
    if (!request.runId?.trim()) {
      return failure(new ValidationError("runId is required"));
    }

    const gateway = setupEnterpriseApi({
      createId: this.createId,
      nowIso: this.nowIso,
      clockMs: this.clockMs,
    });
    const organizationId = request.organizationId ?? gateway.seed!.organizationId;
    const workspaceId = request.workspaceId ?? gateway.seed!.workspaceId;

    const runnerDeps: ScenarioRunnerDeps = {
      productionEngine: this.productionEngine,
      nowIso: this.nowIso,
      clockMs: this.clockMs,
      createId: this.createId,
    };

    const scenarios = resolveScenarios(request.scenarioIds);
    const scenarioResults = [];
    let allChecks = runHealthChecks();

    for (const definition of scenarios) {
      const result = await runValidationScenario(
        definition,
        runnerDeps,
        { organizationId, workspaceId }
      );
      scenarioResults.push({
        scenarioId: result.scenarioId,
        success: result.success,
        stages: result.stages,
      });
      allChecks = mergeChecks(allChecks, result.checks);
    }

    const failureSimulations =
      request.includeFailureSimulation !== false ? runFailureSimulations() : [];

    let loadMetrics;
    if (request.includeLoadTesting !== false) {
      loadMetrics = await runLoadProfile(request.loadProfile ?? "load_10", async () => {
        const t0 = this.clockMs();
        const { token } = await loginDemo(gateway);
        const res = await gateway.gateway.handle(
          apiRequest({
            method: "GET",
            path: "/v1/capabilities",
            headers: { authorization: `Bearer ${token}` },
          })
        );
        return {
          latencyMs: this.clockMs() - t0,
          success: res.ok && res.value.status === 200,
          queueWaitMs: 0,
        };
      });
    }

    const recoveryTests =
      request.includeRecoveryTesting !== false ? runRecoveryTests() : [];

    const securityResults =
      request.includeSecurityValidation !== false
        ? await runSecurityValidation(gateway, organizationId)
        : [];

    const securityPassRate =
      securityResults.length === 0
        ? 100
        : Number(
            (
              (securityResults.filter((r) => r.passed).length / securityResults.length) *
              100
            ).toFixed(1)
          );

    const failureSimPassRate =
      failureSimulations.length === 0
        ? 100
        : Number(
            (
              (failureSimulations.filter((f) => f.passed).length /
                failureSimulations.length) *
              100
            ).toFixed(1)
          );

    const brandBrainOk = allChecks
      .filter((c) => c.area === "brand_brain")
      .every((c) => c.status !== "fail");
    const knowledgeOk = allChecks
      .filter((c) => c.area === "knowledge")
      .every((c) => c.status !== "fail");
    const gatewayOk = allChecks
      .filter((c) => c.area === "gateway")
      .every((c) => c.status !== "fail");
    const productionOk = scenarioResults.every((s) => s.success);

    const partialReport: ValidationRunReport = {
      runId: request.runId,
      success: false,
      scenarios: scenarioResults,
      checks: allChecks,
      failureSimulations,
      loadMetrics,
      recoveryTests,
      securityResults,
      coverage: { scenariosTotal: 0, scenariosPassed: 0, stagesTotal: 0, stagesValidated: 0, apisCovered: [], modulesConsumed: [] },
      certification: {
        overallPercent: 0,
        grade: "F",
        dimensions: [],
        certifiedAt: this.nowIso(),
      },
      durationMs: 0,
      createdAt: this.nowIso(),
    };

    const coverage = buildCoverageSummary(partialReport);
    const certification = buildCertification(allChecks, {
      gatewayOk,
      brandBrainOk,
      knowledgeOk,
      productionOk,
      failureSimPassRate,
      securityPassRate,
      nowIso: this.nowIso,
    });

    const hardFails = allChecks.filter((c) => c.status === "fail");
    const securityFails = securityResults.filter((r) => !r.passed);
    const successOverall =
      scenarioResults.every((s) => s.success) &&
      hardFails.length === 0 &&
      securityFails.length === 0;

    const report: ValidationRunReport = {
      ...partialReport,
      success: successOverall,
      coverage,
      certification,
      durationMs: this.clockMs() - start,
    };

    return success(report);
  }

  async runWithReports(
    request: ValidationRunRequest
  ): Promise<Result<ValidationReportBundle>> {
    const run = await this.run(request);
    if (!run.ok) return run;
    return success(buildReportBundle(run.value));
  }
}
