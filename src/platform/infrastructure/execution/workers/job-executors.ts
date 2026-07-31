/**
 * Job executor adapters — consume Integration / Production Validation public APIs.
 * Workers never own Intelligence logic.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { IJobExecutor } from "../interfaces/execution";
import type { ExecutionJob } from "../contracts/job";
import type { IIntelligenceOsIntegrationEngine } from "../../../intelligence/integration/interfaces/integration";
import type { IProductionValidationEngine } from "../../../production/interfaces/production";
import { asOrganizationId, asWorkspaceId } from "../../../intelligence/shared/identifiers";
import { buildIntegrationJobSummary } from "./integration-job-summary";

export interface IntegrationLayerJobExecutorOptions {
  readonly integrationMode?: "full" | "planning_through_routing";
  readonly executionMode?: "simulated" | "live";
}

export class IntegrationLayerJobExecutor implements IJobExecutor {
  constructor(
    private readonly integration: IIntelligenceOsIntegrationEngine,
    private readonly options: IntegrationLayerJobExecutorOptions = {}
  ) {}

  async execute(
    job: ExecutionJob,
    signal: { cancelled: boolean }
  ): Promise<
    Result<{
      summary: Readonly<Record<string, unknown>>;
      currentProvider?: string;
      stages?: readonly string[];
      durationMs: number;
    }>
  > {
    if (signal.cancelled) {
      return failure(new ValidationError("job cancelled before execution"));
    }

    const start = Date.now();
    const integrationMode =
      (job.payload.metadata?.integrationMode as
        | "full"
        | "planning_through_routing"
        | undefined) ??
      this.options.integrationMode ??
      "planning_through_routing";

    const executionMode = this.options.executionMode ?? "simulated";

    const result = await this.integration.run({
      requestId: String(job.jobId),
      rawPrompt: job.payload.rawPrompt,
      organizationId: job.payload.organizationId
        ? asOrganizationId(job.payload.organizationId)
        : undefined,
      workspaceId: job.payload.workspaceId
        ? asWorkspaceId(job.payload.workspaceId)
        : undefined,
      scenarioHint: job.payload.scenarioHint,
      budgetLimit: job.payload.budgetLimit,
      tokenBudgetLimit: job.payload.tokenBudgetLimit,
      correlationId: job.payload.correlationId ?? String(job.jobId),
      mode: integrationMode,
      metadata: {
        ...(job.payload.metadata ?? {}),
        distributedJobId: String(job.jobId),
        queueKind: job.queueKind,
        enterpriseExecutionMode: executionMode,
        ...(job.payload.capabilityHint
          ? {
              capabilityHint: job.payload.capabilityHint,
              capabilityId: job.payload.capabilityHint,
            }
          : {}),
      },
    });

    if (signal.cancelled) {
      return failure(new ValidationError("job cancelled during execution"));
    }

    if (!result.ok) return result;

    const report = result.value;
    const summary = buildIntegrationJobSummary({
      report,
      executionMode,
      durationMs: Date.now() - start,
    });

    return success({
      summary,
      currentProvider:
        typeof summary.provider === "string" ? summary.provider : undefined,
      stages: report.stagesCompleted.map(String),
      durationMs: report.durationMs || Date.now() - start,
    });
  }
}

/** Optional production-validation executor for certification jobs. */
export class ProductionValidationJobExecutor implements IJobExecutor {
  constructor(private readonly validation: IProductionValidationEngine) {}

  async execute(
    job: ExecutionJob,
    signal: { cancelled: boolean }
  ): Promise<
    Result<{
      summary: Readonly<Record<string, unknown>>;
      currentProvider?: string;
      stages?: readonly string[];
      durationMs: number;
    }>
  > {
    if (signal.cancelled) {
      return failure(new ValidationError("job cancelled before execution"));
    }
    const result = await this.validation.validate({
      requestId: String(job.jobId),
      scenarioId: typeof job.payload.metadata?.scenarioId === "string"
        ? job.payload.metadata.scenarioId
        : "scn_retail",
      correlationId: job.payload.correlationId,
      organizationId: job.payload.organizationId,
      workspaceId: job.payload.workspaceId,
      mode: "openai_simulated",
    });
    if (!result.ok) return result;
    return success({
      summary: {
        success: result.value.success,
        readiness: result.value.readiness.overall,
        grade: result.value.readiness.grade,
      },
      currentProvider: result.value.selectedProvider,
      stages: result.value.checks.map((c) => c.checkId),
      durationMs: result.value.durationMs,
    });
  }
}

/** Deterministic stub executor for unit tests (no Intelligence boot). */
export class StubJobExecutor implements IJobExecutor {
  constructor(
    private readonly behavior: "success" | "fail" | "fail_once" = "success"
  ) {}
  private attempts = new Map<string, number>();

  async execute(
    job: ExecutionJob,
    signal: { cancelled: boolean }
  ): Promise<
    Result<{
      summary: Readonly<Record<string, unknown>>;
      currentProvider?: string;
      stages?: readonly string[];
      durationMs: number;
    }>
  > {
    if (signal.cancelled) {
      return failure(new ValidationError("job cancelled before execution"));
    }
    const n = (this.attempts.get(String(job.jobId)) ?? 0) + 1;
    this.attempts.set(String(job.jobId), n);

    if (this.behavior === "fail") {
      return failure(new ValidationError("transient provider failure"));
    }
    if (this.behavior === "fail_once" && n === 1) {
      return failure(new ValidationError("transient provider failure"));
    }
    return success({
      summary: { ok: true, attempt: n, executionMode: "stub", providerMode: "stub" },
      currentProvider: "stub",
      stages: ["stub_stage"],
      durationMs: 5,
    });
  }
}
