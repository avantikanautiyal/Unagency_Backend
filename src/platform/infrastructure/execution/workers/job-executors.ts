/**
 * Job executor adapters — consume Integration / Production Validation public APIs.
 * Workers never own Intelligence logic.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { IJobExecutor } from "../interfaces/execution";
import type { ExecutionJob } from "../contracts/job";
import type { IIntelligenceOsIntegrationEngine } from "../../../intelligence/integration/interfaces/integration";
import type { IIntelligenceGateway } from "../../../intelligence/gateway/interfaces/intelligence-gateway";
import {
  runIntegrationViaControlPlane,
  resolveControlPlaneWorkspaceId,
} from "../../../api/services/integration-control-plane-runner";
import type { IProductionValidationEngine } from "../../../production/interfaces/production";
import { asOrganizationId, asWorkspaceId } from "../../../intelligence/shared/identifiers";
import { buildIntegrationJobSummary } from "./integration-job-summary";
import { isImageGenerationCapability } from "../../../intelligence/providers/common/resolve-execution-modality";

export type SyncImageMaterializer = (input: {
  readonly executionId: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly runtimeOutput: Readonly<Record<string, unknown>> | undefined;
}) => Promise<Result<readonly string[]>>;

export interface IntegrationLayerJobExecutorOptions {
  readonly integrationMode?: "full" | "planning_through_routing";
  readonly executionMode?: "simulated" | "live";
  /** Persist sync image.generate bytes before the job summary drops runtime payloads. */
  readonly materializeSyncImage?: SyncImageMaterializer;
  /** When set, distributed jobs route through kernel → gateway → orchestrator. */
  readonly intelligenceGateway?: IIntelligenceGateway;
}

/** Mutable gateway slot — wired post-bootstrap when async gateway becomes available. */
export class IntelligenceGatewayHolder {
  private gateway?: IIntelligenceGateway;

  set(gateway: IIntelligenceGateway): void {
    this.gateway = gateway;
  }

  get(): IIntelligenceGateway | undefined {
    return this.gateway;
  }
}

export class IntegrationLayerJobExecutor implements IJobExecutor {
  constructor(
    private readonly integration: IIntelligenceOsIntegrationEngine,
    private readonly options: IntegrationLayerJobExecutorOptions = {},
    private readonly gatewayHolder?: IntelligenceGatewayHolder
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
    // Canonical spine: distributed jobs always run the full IntegrationPipeline.
    const integrationMode = "full" as const;

    const executionMode = this.options.executionMode ?? "simulated";

    const capabilityId =
      (typeof job.payload.capabilityHint === "string" && job.payload.capabilityHint) ||
      (typeof job.payload.metadata?.capabilityId === "string" &&
        job.payload.metadata.capabilityId) ||
      "text.generate";

    const organizationId = String(job.payload.organizationId ?? "");
    const apiExecutionId = String(
      job.payload.metadata?.apiExecutionId ??
        job.payload.metadata?.executionId ??
        job.jobId
    );

    const integrationRequest = {
      requestId: apiExecutionId,
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
        capabilityHint: capabilityId,
        capabilityId,
      },
    } as const;

    const gateway =
      this.options.intelligenceGateway ?? this.gatewayHolder?.get();

    const result = await runIntegrationViaControlPlane({
      gateway,
      integration: this.integration,
      request: integrationRequest,
      capabilityId,
      organizationId,
      workspaceId: resolveControlPlaneWorkspaceId(job.payload.workspaceId),
      apiExecutionId,
    });

    if (signal.cancelled) {
      return failure(new ValidationError("job cancelled during execution"));
    }

    if (!result.ok) return result;

    const report = result.value;
    let summary: Record<string, unknown> = {
      ...buildIntegrationJobSummary({
        report,
        executionMode,
        durationMs: Date.now() - start,
      }),
    };

    const capability =
      (typeof job.payload.capabilityHint === "string" &&
        job.payload.capabilityHint) ||
      (typeof job.payload.metadata?.capabilityId === "string" &&
        job.payload.metadata.capabilityId) ||
      "unknown";

    // Distributed jobs only keep a safe summary — materialize sync images here
    // while runtime.response.output.outputs (base64) is still in memory.
    if (
      report.success &&
      isImageGenerationCapability(capability) &&
      this.options.materializeSyncImage
    ) {
      const executionId = String(
        job.payload.metadata?.apiExecutionId ??
          job.payload.metadata?.executionId ??
          job.jobId
      );
      const organizationId = String(job.payload.organizationId ?? "org_unknown");
      const runtimeOutput = report.artifacts.runtime?.response?.output as
        | Readonly<Record<string, unknown>>
        | undefined;
      const providerId = String(
        report.artifacts.runtime?.finalProviderId ??
          report.artifacts.runtime?.response?.providerId ??
          summary.routedProviderId ??
          summary.provider ??
          "provider.unknown"
      );
      const modelId = String(
        report.artifacts.runtime?.finalModelId ??
          summary.routedModelId ??
          summary.model ??
          "unknown"
      );
      const materialized = await this.options.materializeSyncImage({
        executionId,
        organizationId,
        providerId,
        modelId,
        capabilityId: capability,
        runtimeOutput,
      });
      if (materialized.ok && materialized.value.length > 0) {
        summary = {
          ...summary,
          mediaArtifactIds: [...materialized.value],
          providerId,
          modelId,
        };
        console.log(
          `🖼️  [AI OS] sync image materialized | executionId=${executionId} | artifacts=${materialized.value.join(", ")}`
        );
      } else {
        const reason = !materialized.ok
          ? materialized.error.message
          : "no artifact ids";
        summary = {
          ...summary,
          mediaMaterializationError: reason,
        };
        console.warn(
          `🖼️  [AI OS] sync image materialization failed | executionId=${executionId} | ${reason}`
        );
      }
    }

    const provider =
      typeof summary.routedProviderId === "string"
        ? summary.routedProviderId
        : typeof summary.provider === "string"
          ? summary.provider
          : "unresolved";
    const model =
      typeof summary.routedModelId === "string"
        ? summary.routedModelId
        : typeof summary.model === "string"
          ? summary.model
          : "unresolved";
    const evaluationScore =
      typeof summary.evaluationScore === "number"
        ? summary.evaluationScore
        : typeof summary.qualityScore === "number"
          ? summary.qualityScore
          : null;
    const stagesCompleted = Array.isArray(summary.stagesCompleted)
      ? summary.stagesCompleted
      : report.stagesCompleted.length;

    console.log(
      [
        "⚙️  [AI OS] execution complete",
        `mode=${executionMode}`,
        `success=${String(summary.success)}`,
        `capability=${capability}`,
        `provider=${provider}`,
        `model=${model}`,
        `routingDecision=${String(summary.routingDecisionId ?? "n/a")}`,
        `evaluatorScore=${evaluationScore == null ? "n/a" : evaluationScore.toFixed(3)}`,
        `stages=${stagesCompleted}`,
        `durationMs=${summary.durationMs ?? Date.now() - start}`,
        summary.errorMessage ? `error=${summary.errorMessage}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    );

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
