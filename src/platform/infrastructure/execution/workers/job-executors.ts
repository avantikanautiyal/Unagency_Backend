/**
 * Job executor adapters — distributed jobs call DirectExecutionEngine.
 * Workers never own intelligence / prompt-compiler logic.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { IJobExecutor } from "../interfaces/execution";
import type { ExecutionJob } from "../contracts/job";
import type { IDirectExecutionEngine } from "../../../direct/contracts";
import {
  runDirectProviderExecution,
  resolveControlPlaneWorkspaceId,
} from "../../../api/services/integration-control-plane-runner";
import { asOrganizationId, asWorkspaceId } from "../../../core/identifiers";
import { buildIntegrationJobSummary } from "./integration-job-summary";
import { isImageGenerationCapability } from "../../../providers/common/resolve-execution-modality";
import {
  isRequiredDocumentOrPresentationExport,
  isSoftDocumentExportMiss,
} from "../../../api/services/document-export-materializer";

export type SyncImageMaterializer = (input: {
  readonly executionId: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly runtimeOutput: Readonly<Record<string, unknown>> | undefined;
}) => Promise<Result<readonly string[]>>;

export type DocumentExportMaterializer = (input: {
  readonly executionId: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly jobSummary: Readonly<Record<string, unknown>>;
  readonly runtimeOutput: Readonly<Record<string, unknown>> | undefined;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
}) => Promise<
  Result<{
    readonly artifactIds: readonly string[];
    readonly structuredData?: unknown;
    readonly exportKind?: string;
  }>
>;

export interface IntegrationLayerJobExecutorOptions {
  readonly integrationMode?: "full" | "planning_through_routing";
  readonly executionMode?: "simulated" | "live";
  readonly materializeSyncImage?: SyncImageMaterializer;
  readonly materializeDocumentExport?: DocumentExportMaterializer;
}

/**
 * Distributed job executor for the direct provider spine.
 * Class name is legacy ("IntegrationLayer"); implementation is DirectExecutionEngine only.
 */
export class IntegrationLayerJobExecutor implements IJobExecutor {
  constructor(
    private readonly integration: IDirectExecutionEngine,
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
    // Distributed jobs always run full direct provider execution (not planning-only).
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

    const result = await runDirectProviderExecution({
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
          `🖼️  [Direct] sync image materialized | executionId=${executionId} | artifacts=${materialized.value.join(", ")}`
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
          `🖼️  [Direct] sync image materialization failed | executionId=${executionId} | ${reason}`
        );
      }
    }

    // Document/presentation plans must be exported while runtime output is still
    // in memory — distributed jobs only retain a summary afterward.
    // Gate on recoverable structured data (or a known plan schema name). Export
    // itself requires parseable plan data — name alone must not hard-fail the job.
    const structuredNameHint = String(
      (job.payload.metadata?.structuredOutput as { name?: unknown } | undefined)
        ?.name ?? ""
    ).toLowerCase();
    const likelyDocumentExport =
      summary.structuredData != null ||
      structuredNameHint === "documentplan" ||
      structuredNameHint === "presentationplan" ||
      structuredNameHint === "presentationroutes" ||
      structuredNameHint === "presentationrouteconcepts" ||
      structuredNameHint === "emailplan";
    if (
      report.success &&
      likelyDocumentExport &&
      this.options.materializeDocumentExport
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
      const exported = await this.options.materializeDocumentExport({
        executionId,
        organizationId,
        providerId,
        modelId,
        jobSummary: summary,
        runtimeOutput,
        metadata: job.payload.metadata,
      });
      if (exported.ok) {
        summary = {
          ...summary,
          ...(exported.value.structuredData !== undefined
            ? { structuredData: exported.value.structuredData }
            : {}),
          ...(exported.value.exportKind
            ? { documentExportKind: exported.value.exportKind }
            : {}),
          mediaArtifactIds: [
            ...new Set([
              ...(Array.isArray(summary.mediaArtifactIds)
                ? (summary.mediaArtifactIds as string[])
                : []),
              ...exported.value.artifactIds,
            ]),
          ],
          providerId,
          modelId,
        };
        console.log(
          `📄 [Direct] document export materialized | executionId=${executionId} | artifacts=${exported.value.artifactIds.join(", ")}`
        );
      } else if (exported.error.message) {
        const softMiss = isSoftDocumentExportMiss(exported.error.message);
        const meta = job.payload.metadata as
          | Readonly<Record<string, unknown>>
          | undefined;
        const structuredName =
          meta?.structuredOutput &&
          typeof meta.structuredOutput === "object"
            ? String(
                (meta.structuredOutput as { name?: unknown }).name ?? ""
              )
            : undefined;
        const required = isRequiredDocumentOrPresentationExport({
          outputKind:
            typeof meta?.outputKind === "string" ? meta.outputKind : undefined,
          structuredName,
          service:
            typeof meta?.service === "string" ? meta.service : undefined,
          subtype:
            typeof meta?.subtype === "string" ? meta.subtype : undefined,
          deliverableRequired: meta?.deliverableRequired === true,
        });
        if (required || !softMiss) {
          summary = {
            ...summary,
            success: false,
            errorMessage: exported.error.message,
          };
          console.warn(
            `📄 [Direct] document export failed | executionId=${executionId} | ${exported.error.message}`
          );
        } else if (softMiss) {
          console.warn(
            `📄 [Direct] document export skipped | executionId=${executionId} | ${exported.error.message}`
          );
        }
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
        "⚙️  [Direct] execution complete",
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
