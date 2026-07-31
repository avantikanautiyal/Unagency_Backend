/**
 * Execution API service — bridges Distributed Execution + Integration Layer.
 * Never exposes Runtime/Routing/Providers to clients.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError, NotFoundError, AuthorizationError } from "../../intelligence/shared/errors";
import type { IDistributedExecutionEngine } from "../../infrastructure/execution/interfaces/execution";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../intelligence/shared/identifiers";
import type {
  AuthPrincipal,
  CreateExecutionRequest,
  ExecutionArtifactRef,
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionResource,
  ExecutionTraceSummary,
  TenantContext,
} from "../contracts";
import type { IExecutionApiService, IStreamingService } from "../interfaces";
import { buildExecutionIntelligenceSnapshot } from "../execution-intelligence/projection/build-snapshot";
import type { ExecutionIntelligenceSnapshot } from "../execution-intelligence";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import { integrationPipelineModeFor } from "../runtime/execution-mode";
import { isFirebaseAuthenticatedPrincipal } from "../auth/firebase/firebase-authentication-adapter";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  IIdempotencyStore,
  ITenantUsageStore,
} from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { AsyncExecutionCoordinator } from "../../intelligence/providers/async/coordination/async-execution-coordinator";
import { isAsyncExecutionRequest } from "../../intelligence/providers/async/coordination/async-execution-coordinator";
import {
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../intelligence/providers/common/resolve-execution-modality";
import {
  fakeAsyncProviderId,
} from "../../intelligence/providers/async/fake/fake-async-provider";
import { buildExecutionResultPayload } from "./execution-result-payload";
import {
  buildPendingApprovals,
  type PendingToolApprovalPresentation,
} from "./tool-approval-presentation";
import { mapProviderOperationToExecutionStatus } from "../../intelligence/providers/async/coordination/map-operation-status";
import {
  approveToolInvocation,
  type ToolRuntimePlatform,
} from "../../intelligence/providers/tools/composition/tool-runtime-platform";
import {
  startEnterpriseSimulatedStream,
  type LiveSseExecutionPayload,
} from "./execution-streaming-service";

function diagnosticsFromJobSummary(
  executionId: string,
  errorMessage: string | undefined,
  jobSummary: Readonly<Record<string, unknown>>,
  nowIso: string,
  jobId?: string,
  status?: ExecutionResource["status"]
): ExecutionDiagnostics {
  return {
    executionId,
    rootCause: errorMessage,
    stages: [
      { stage: "api_gateway", status: "ok", durationMs: 1 },
      { stage: "distributed_execution", status: jobId ? "ok" : "skipped" },
      {
        stage: "integration_layer",
        status: status === "failed" ? "error" : "ok",
      },
    ],
    generatedAt: nowIso,
    executionMode:
      typeof jobSummary.executionMode === "string"
        ? jobSummary.executionMode
        : undefined,
    providerMode:
      typeof jobSummary.providerMode === "string"
        ? jobSummary.providerMode
        : undefined,
    provider:
      typeof jobSummary.provider === "string" ? jobSummary.provider : undefined,
    model: typeof jobSummary.model === "string" ? jobSummary.model : undefined,
    routingDecisionId:
      typeof jobSummary.routingDecisionId === "string"
        ? jobSummary.routingDecisionId
        : undefined,
    contextSnapshotId:
      typeof jobSummary.contextSnapshotId === "string"
        ? jobSummary.contextSnapshotId
        : undefined,
    promptCompilationId:
      typeof jobSummary.promptCompilationId === "string"
        ? jobSummary.promptCompilationId
        : undefined,
    brandEnrichmentId:
      typeof jobSummary.brandEnrichmentId === "string"
        ? jobSummary.brandEnrichmentId
        : undefined,
    brandBrainVersion:
      typeof jobSummary.brandBrainVersion === "number"
        ? jobSummary.brandBrainVersion
        : undefined,
    knowledgeSnapshotId:
      typeof jobSummary.knowledgeSnapshotId === "string"
        ? jobSummary.knowledgeSnapshotId
        : undefined,
    inputTokens:
      typeof jobSummary.inputTokens === "number"
        ? jobSummary.inputTokens
        : undefined,
    outputTokens:
      typeof jobSummary.outputTokens === "number"
        ? jobSummary.outputTokens
        : undefined,
    totalTokens:
      typeof jobSummary.totalTokens === "number"
        ? jobSummary.totalTokens
        : undefined,
    providerLatencyMs:
      typeof jobSummary.providerLatencyMs === "number"
        ? jobSummary.providerLatencyMs
        : undefined,
    artifactId:
      typeof jobSummary.artifactId === "string"
        ? jobSummary.artifactId
        : undefined,
    evaluationScore:
      typeof jobSummary.evaluationScore === "number"
        ? jobSummary.evaluationScore
        : undefined,
  };
}

export class ExecutionApiService implements IExecutionApiService {
  private static readonly MAX_PROMPT_CHARS = 100_000;
  private static readonly MAX_METADATA_BYTES = 65_536;

  private readonly executionStore = new Map<string, ExecutionResource>();
  private readonly artifactStore = new Map<string, ExecutionArtifactRef[]>();
  private readonly idempotencyIndex = new Map<
    string,
    { fingerprint: string; executionId: string }
  >();
  private readonly tenantTokenUsage = new Map<string, number>();
  private readonly extrasStore = new Map<
    string,
    {
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
    }
  >();

  constructor(
    private readonly deps: {
      nowIso: () => string;
      createId: (prefix: string) => string;
      clockMs: () => number;
      distributed?: IDistributedExecutionEngine;
      integration?: IIntelligenceOsIntegrationEngine;
      streaming?: IStreamingService;
      /** When true, tick distributed workers after enqueue. */
      autoTick?: boolean;
      /** Optional explainability sink — never receives prompts/secrets. */
      onIntelligenceSnapshot?: (snapshot: ExecutionIntelligenceSnapshot) => void;
      executionMode?: EnterpriseApiExecutionMode;
      /** M9.4 durable persistence — when set, replaces process-local Maps for production. */
      persistence?: {
        executions: IExecutionRepository;
        artifacts: IArtifactRepository;
        extras: IExecutionExtrasRepository;
        idempotency: IIdempotencyStore;
        tenantUsage: ITenantUsageStore;
      };
      asyncCoordinator?: AsyncExecutionCoordinator;
      /** Cap → Model → Routing for video.generate (executable registry only). */
      videoRouter?: import("../../intelligence/providers/video/routing/video-execution-router").VideoExecutionRouter;
      toolRuntime?: ToolRuntimePlatform;
    }
  ) {}

  async createStream(
    req: CreateExecutionRequest,
    principal: AuthPrincipal,
    tenant: TenantContext,
    abortSignal?: AbortSignal
  ): Promise<Result<LiveSseExecutionPayload>> {
    return startEnterpriseSimulatedStream({
      req,
      principal,
      tenant,
      abortSignal,
      deps: {
        nowIso: this.deps.nowIso,
        createId: this.deps.createId,
        sleep: async () => undefined,
        saveExecution: async (resource) => {
          this.executionStore.set(resource.executionId, resource);
          if (this.deps.persistence) {
            const existing = await this.deps.persistence.executions.get(
              resource.executionId
            );
            if (existing) {
              await this.deps.persistence.executions.update(resource);
            } else {
              await this.deps.persistence.executions.save(resource);
            }
          }
          // Seed durable approval rows so M10.7 decide/resume works after stream handoff.
          if (
            resource.status === "awaiting_approval" &&
            this.deps.toolRuntime &&
            resource.pendingApprovals?.length
          ) {
            for (const pending of resource.pendingApprovals) {
              await this.deps.toolRuntime.invocationStore.upsertAwaitingApproval({
                invocationKey: pending.invocationId,
                organizationId: resource.organizationId,
                executionId: resource.executionId,
                round: 1,
                toolCallId: pending.invocationId,
                toolName: pending.toolName,
                riskClass: "write",
                status: "awaiting_approval",
                authorizationDecision: "requires_approval",
                createdAt: this.deps.nowIso(),
                updatedAt: this.deps.nowIso(),
                checkpoint: {
                  messages: [],
                  providerId: "provider.stream_sim",
                  modelId: "model.stream_sim",
                  capabilityId: resource.capabilityId ?? "text.generate",
                  prompt: resource.promptPreview,
                  toolNames: [pending.toolName],
                  phase: "awaiting_approval",
                },
              });
            }
          }
        },
      },
    });
  }

  async create(
    req: CreateExecutionRequest,
    principal: AuthPrincipal
  ): Promise<Result<ExecutionResource>> {
    if (!req.prompt?.trim()) {
      return failure(new ValidationError("prompt is required"));
    }
    if (!req.organizationId) {
      return failure(new ValidationError("organizationId is required"));
    }
    if (req.prompt.length > ExecutionApiService.MAX_PROMPT_CHARS) {
      return failure(new ValidationError("prompt exceeds maximum length"));
    }
    if (req.metadata) {
      const metaSize = JSON.stringify(req.metadata).length;
      if (metaSize > ExecutionApiService.MAX_METADATA_BYTES) {
        return failure(new ValidationError("metadata exceeds maximum size"));
      }
    }
    if (
      req.tokenBudgetLimit != null &&
      (req.tokenBudgetLimit <= 0 || !Number.isFinite(req.tokenBudgetLimit))
    ) {
      return failure(new ValidationError("tokenBudgetLimit must be a positive number"));
    }

    if (isFirebaseAuthenticatedPrincipal(principal)) {
      if (!principal.organizationId) {
        return failure(
          new AuthorizationError("organization not resolved for authenticated user")
        );
      }
      if (principal.organizationId !== req.organizationId) {
        return failure(new AuthorizationError("tenant isolation violation"));
      }
    } else if (
      principal.organizationId &&
      principal.organizationId !== req.organizationId
    ) {
      return failure(new AuthorizationError("tenant isolation violation"));
    }

    // Trusted tenant for downstream intelligence (never use untrusted client override).
    const trustedOrganizationId =
      isFirebaseAuthenticatedPrincipal(principal) && principal.organizationId
        ? principal.organizationId
        : req.organizationId;

    const requestFingerprint = JSON.stringify({
      prompt: req.prompt,
      projectId: req.projectId,
      brandId:
        typeof req.metadata?.brandId === "string" ? req.metadata.brandId : undefined,
      capabilityId: req.capabilityId,
    });

    if (req.idempotencyKey?.trim()) {
      const idemStoreKey = `${trustedOrganizationId}:${req.idempotencyKey.trim()}`;
      if (this.deps.persistence) {
        if (!this.deps.persistence.idempotency.isAvailable()) {
          return failure(
            new ValidationError(
              "idempotency store unavailable — refusing duplicate-unsafe request (fail-closed)"
            )
          );
        }
      }
      const prior = this.deps.persistence
        ? await this.deps.persistence.idempotency.get(idemStoreKey)
        : this.idempotencyIndex.get(idemStoreKey);
      if (prior) {
        if (prior.fingerprint !== requestFingerprint) {
          return failure(
            new ValidationError("idempotency key reused with different payload")
          );
        }
        const existing = await this.loadExecution(prior.executionId);
        if (existing) {
          return success(existing);
        }
      }
    }

    const tenantTokenCeiling = Number(
      process.env.ENTERPRISE_API_TENANT_TOKEN_CEILING ?? 0
    );
    if (tenantTokenCeiling > 0) {
      if (this.deps.persistence && !this.deps.persistence.tenantUsage.isAvailable()) {
        return failure(
          new ValidationError(
            "tenant usage store unavailable — refusing unbounded LIVE traffic (fail-closed)"
          )
        );
      }
      const used = this.deps.persistence
        ? await this.deps.persistence.tenantUsage.getTokensUsed(trustedOrganizationId)
        : this.tenantTokenUsage.get(trustedOrganizationId) ?? 0;
      if (used >= tenantTokenCeiling) {
        return failure(new ValidationError("tenant token budget exceeded"));
      }
    }

    const executionId = this.deps.createId("exec");
    const correlationId = this.deps.createId("corr");
    const now = this.deps.nowIso();

    if (
      this.deps.asyncCoordinator &&
      isAsyncExecutionRequest({
        capabilityId: req.capabilityId,
        metadata: req.metadata,
        hasAsyncCoordinator: true,
        executionMode: this.deps.executionMode,
      })
    ) {
      const capabilityId = req.capabilityId ?? "video.generate";
      const preferredProviderId =
        req.providerId?.trim() ||
        (typeof req.metadata?.providerId === "string" ? req.metadata.providerId : undefined);
      const preferredModelId =
        req.modelId?.trim() ||
        (typeof req.metadata?.modelId === "string" ? req.metadata.modelId : undefined);

      let providerId = preferredProviderId ?? "";
      let modelId = preferredModelId ?? "";
      let routingDecisionId: string | undefined;
      let failoverChain: { providerId: string; modelId: string }[] = [];

      const useSimulatedFakeLeaf =
        (this.deps.executionMode === "simulated" || this.deps.executionMode === "stub") &&
        (isVideoGenerationCapability(capabilityId) ||
          isImageGenerationCapability(capabilityId));

      if (useSimulatedFakeLeaf && !preferredProviderId) {
        // Credential-free M10.6 path — Model/Routing authority still owns LIVE video.
        providerId = String(fakeAsyncProviderId());
        modelId = "fake-async-model";
      } else if (isVideoGenerationCapability(capabilityId) && this.deps.videoRouter) {
        const routed = await this.deps.videoRouter.resolve({
          prompt: req.prompt,
          capabilityId,
          preferredProviderId,
          preferredModelId,
        });
        if (!routed.ok) {
          // Fall back to simulated fake leaf when LIVE video leaf unavailable.
          if (this.deps.executionMode !== "live") {
            providerId = String(fakeAsyncProviderId());
            modelId = "fake-async-model";
          } else {
            return routed;
          }
        } else {
          providerId = routed.value.providerId;
          modelId = routed.value.modelId;
          routingDecisionId = routed.value.routingDecisionId;
          failoverChain = [...(routed.value.failoverChain ?? [])];
        }
      } else if (isImageGenerationCapability(capabilityId)) {
        providerId = preferredProviderId || String(fakeAsyncProviderId());
        modelId = preferredModelId || "fake-async-model";
      } else if (!providerId || !modelId) {
        return failure(
          new ValidationError(
            "async media execution requires routing or simulated fake async provider"
          )
        );
      }

      const resource: ExecutionResource = {
        executionId,
        status: "waiting_provider",
        organizationId: trustedOrganizationId,
        workspaceId: req.workspaceId,
        capabilityId,
        correlationId,
        createdAt: now,
        updatedAt: now,
        promptPreview: req.prompt.slice(0, 120),
        result: { kind: "pending" },
      };
      if (this.deps.persistence) {
        await this.deps.persistence.executions.save(resource);
      } else {
        this.executionStore.set(executionId, resource);
      }

      const submit = await this.deps.asyncCoordinator.submitExecution({
        executionId,
        organizationId: trustedOrganizationId,
        workspaceId: req.workspaceId,
        prompt: req.prompt,
        correlationId,
        providerId,
        modelId,
        capabilityId,
        payload: {
          prompt: req.prompt,
          ...(req.metadata?.payload as Record<string, unknown> | undefined),
          ...(Array.isArray(req.metadata?.assets) ? { assets: req.metadata.assets } : {}),
          ...(req.metadata?.image ? { image: req.metadata.image } : {}),
          ...(req.metadata?.duration != null ? { duration: req.metadata.duration } : {}),
          ...(req.metadata?.aspectRatio != null
            ? { aspectRatio: req.metadata.aspectRatio }
            : {}),
          ...(req.metadata?.resolution != null ? { resolution: req.metadata.resolution } : {}),
          ...(routingDecisionId ? { routingDecisionId } : {}),
          ...(failoverChain.length ? { failoverChain } : {}),
        },
      });
      if (!submit.ok) {
        const failed: ExecutionResource = { ...resource, status: "failed", errorMessage: submit.error.message };
        if (this.deps.persistence) await this.deps.persistence.executions.update(failed);
        else this.executionStore.set(executionId, failed);
        return submit;
      }

      if (req.idempotencyKey?.trim() && this.deps.persistence) {
        const idemRecord = { fingerprint: requestFingerprint, executionId };
        await this.deps.persistence.idempotency.set(
          `${trustedOrganizationId}:${req.idempotencyKey.trim()}`,
          idemRecord
        );
      }

      return success(resource);
    }

    let jobId: string | undefined;
    let status: ExecutionResource["status"] = "queued";
    let cost: number | undefined;
    let evaluationScore: number | undefined;
    let errorMessage: string | undefined;
    let completedAt: string | undefined;
    let approvalRequired = false;
    let toolInvocationKey: string | undefined;
    let jobSummary: Readonly<Record<string, unknown>> = {};
    const apiExecutionMode = this.deps.executionMode ?? "stub";
    const baseIntegrationMode = integrationPipelineModeFor(apiExecutionMode);
    const needsProviderRuntime = Boolean(
      req.toolNames?.length ||
        req.structuredOutput ||
        (Array.isArray(req.metadata?.toolNames) && req.metadata.toolNames.length > 0) ||
        req.metadata?.structuredOutput
    );
    // Tool / structured-output executions require provider_runtime (not planning-only).
    const integrationMode = needsProviderRuntime ? "full" : baseIntegrationMode;

    if (this.deps.distributed) {
      const enq = await this.deps.distributed.enqueue({
        payload: {
          rawPrompt: req.prompt,
          organizationId: trustedOrganizationId,
          workspaceId: req.workspaceId,
          budgetLimit: req.budgetLimit,
          tokenBudgetLimit: req.tokenBudgetLimit,
          correlationId,
          capabilityHint: req.capabilityId,
          metadata: {
            ...(req.metadata ?? {}),
            ...(req.toolNames ? { toolNames: req.toolNames } : {}),
            ...(req.structuredOutput ? { structuredOutput: req.structuredOutput } : {}),
            apiExecutionId: executionId,
            executionId,
            userId: principal.userId,
            roles: principal.roles,
            projectId: req.projectId,
            integrationMode,
            enterpriseExecutionMode: apiExecutionMode,
            brandId:
              typeof req.metadata?.brandId === "string"
                ? req.metadata.brandId
                : undefined,
            campaignId:
              typeof req.metadata?.campaignId === "string"
                ? req.metadata.campaignId
                : undefined,
          },
        },
        queueKind: "immediate",
      });
      if (!enq.ok) return enq;
      jobId = String(enq.value.jobId);
      if (this.deps.autoTick !== false) {
        this.deps.distributed.registerWorker("execution", 2);
        const tick = await this.deps.distributed.tick(1);
        if (tick.ok) {
          const job = this.deps.distributed.getJob(enq.value.jobId);
          if (job.ok && job.value) {
            status = mapJobStatus(job.value.status);
            completedAt = job.value.completedAt;
            errorMessage = job.value.lastError;
            const summary = job.value.resultSummary ?? {};
            jobSummary = summary;
            cost = Number(summary.cost ?? 0.01) || 0.01;
            evaluationScore =
              typeof summary.evaluationScore === "number" &&
              Number.isFinite(summary.evaluationScore)
                ? Number(summary.evaluationScore)
                : typeof summary.qualityScore === "number" &&
                    Number.isFinite(summary.qualityScore)
                  ? Number(summary.qualityScore)
                  : undefined;
            if (summary.awaitingToolApproval === true) {
              status = "awaiting_approval";
              approvalRequired = true;
              toolInvocationKey =
                typeof summary.toolInvocationKey === "string"
                  ? summary.toolInvocationKey
                  : undefined;
              completedAt = undefined;
              errorMessage =
                typeof summary.errorMessage === "string"
                  ? summary.errorMessage
                  : "tool approval required";
            } else if (summary.success === false) {
              status = "failed";
              errorMessage =
                typeof summary.errorMessage === "string"
                  ? summary.errorMessage
                  : "integration context resolution failed";
            }
          }
        }
      }
    } else if (this.deps.integration) {
      status = "running";
      const run = await this.deps.integration.run({
        requestId: executionId,
        rawPrompt: req.prompt,
        organizationId: asOrganizationId(trustedOrganizationId),
        workspaceId: req.workspaceId
          ? asWorkspaceId(req.workspaceId)
          : undefined,
        budgetLimit: req.budgetLimit,
        tokenBudgetLimit: req.tokenBudgetLimit,
        correlationId,
        mode: "full",
        metadata: {
          ...(req.metadata ?? {}),
          ...(req.toolNames ? { toolNames: req.toolNames } : {}),
          ...(req.structuredOutput ? { structuredOutput: req.structuredOutput } : {}),
          ...(req.capabilityId
            ? { capabilityHint: req.capabilityId, capabilityId: req.capabilityId }
            : {}),
          apiExecutionId: executionId,
          executionId,
          userId: principal.userId,
          roles: principal.roles,
          projectId: req.projectId,
          brandId:
            typeof req.metadata?.brandId === "string"
              ? req.metadata.brandId
              : undefined,
          campaignId:
            typeof req.metadata?.campaignId === "string"
              ? req.metadata.campaignId
              : undefined,
        },
      });
      if (!run.ok) return run;
      const runtime = run.value.artifacts.runtime;
      const awaitingToolApproval =
        runtime?.error?.code === "TOOL_APPROVAL_REQUIRED";
      approvalRequired = awaitingToolApproval;
      const toolApproval = runtime?.response?.output?.toolApproval as
        | { invocationKeys?: unknown }
        | undefined;
      toolInvocationKey = Array.isArray(toolApproval?.invocationKeys)
        ? toolApproval.invocationKeys.find(
            (key): key is string => typeof key === "string"
          )
        : undefined;
      status = awaitingToolApproval
        ? "awaiting_approval"
        : run.value.success
          ? "succeeded"
          : "failed";
      completedAt = awaitingToolApproval ? undefined : this.deps.nowIso();
      cost = undefined;
      evaluationScore =
        run.value.artifacts.evaluation?.integrity?.qualityScore ??
        (run.value.artifacts.evaluation?.integrity?.feedbackEligible
          ? run.value.artifacts.evaluation?.report?.summary?.overallScore
          : undefined);
      // Never invent quality when integrity says quality is unknown.
      if (
        run.value.artifacts.evaluation?.integrity &&
        run.value.artifacts.evaluation.integrity.qualityScore == null
      ) {
        evaluationScore = undefined;
      }
      errorMessage = awaitingToolApproval
        ? runtime?.error?.message
        : run.value.success
          ? undefined
          : "integration failed";
      const eiAttrs = (
        run.value.artifacts.contextTrace ?? {}
      ) as Readonly<Record<string, unknown>>;
      const runtimeOutput = (runtime?.response?.output ?? {}) as Readonly<
        Record<string, unknown>
      >;
      jobSummary = {
        contextSnapshotId: eiAttrs.contextSnapshotId,
        brandEnrichmentId: eiAttrs.brandEnrichmentId,
        brandBrainVersion: eiAttrs.brandBrainVersion,
        knowledgeSnapshotId: eiAttrs.knowledgeSnapshotId,
        promptCompilationId: eiAttrs.promptCompilationId,
        executionMode: "simulated",
        providerMode: "simulated",
        awaitingToolApproval,
        ...(typeof runtimeOutput.content === "string"
          ? { resultText: runtimeOutput.content }
          : typeof runtimeOutput.text === "string"
            ? { resultText: runtimeOutput.text }
            : typeof runtimeOutput.message === "string"
              ? { resultText: runtimeOutput.message }
              : {}),
      };
    } else {
      // Platform-local completion (tests / degraded mode) — still API-mediated.
      status = "succeeded";
      completedAt = now;
      cost = undefined;
      evaluationScore = undefined;
    }

    const result = buildExecutionResultPayload({
      status,
      jobSummary,
    });

    let pendingApprovals: readonly PendingToolApprovalPresentation[] | undefined;
    if (status === "awaiting_approval" && this.deps.toolRuntime) {
      const records = await this.deps.toolRuntime.invocationStore.listByExecution(
        executionId
      );
      pendingApprovals = buildPendingApprovals(records);
      if (!toolInvocationKey && pendingApprovals[0]) {
        toolInvocationKey = pendingApprovals[0].invocationId;
      }
    }

    const resource: ExecutionResource = {
      executionId,
      status,
      organizationId: trustedOrganizationId,
      workspaceId: req.workspaceId,
      capabilityId: req.capabilityId,
      correlationId,
      jobId,
      createdAt: now,
      updatedAt: this.deps.nowIso(),
      completedAt,
      promptPreview: req.prompt.slice(0, 120),
      cost,
      evaluationScore,
      errorMessage,
      approvalRequired: approvalRequired || undefined,
      toolInvocationKey,
      pendingApprovals,
      result:
        status === "awaiting_approval"
          ? {
              kind: "tool_approval_required",
              data: pendingApprovals?.length
                ? { pendingApprovals }
                : undefined,
            }
          : result,
    };
    this.executionStore.set(executionId, resource);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.save(resource);
    }
    if (req.idempotencyKey?.trim()) {
      const idemRecord = { fingerprint: requestFingerprint, executionId };
      const idemStoreKey = `${trustedOrganizationId}:${req.idempotencyKey.trim()}`;
      if (this.deps.persistence) {
        await this.deps.persistence.idempotency.set(idemStoreKey, idemRecord);
      } else {
        this.idempotencyIndex.set(idemStoreKey, idemRecord);
      }
    }
    const tokensUsed = Number(jobSummary.totalTokens ?? 0);
    if (tokensUsed > 0) {
      if (this.deps.persistence) {
        await this.deps.persistence.tenantUsage.addTokens(trustedOrganizationId, tokensUsed);
      } else {
        const prev = this.tenantTokenUsage.get(trustedOrganizationId) ?? 0;
        this.tenantTokenUsage.set(trustedOrganizationId, prev + tokensUsed);
      }
    }
    const artifactRefs: ExecutionArtifactRef[] = [
      {
        artifactId: this.deps.createId("art"),
        kind: "response",
        label: "primary_output",
      },
    ];
    this.artifactStore.set(executionId, artifactRefs);
    if (this.deps.persistence) {
      await this.deps.persistence.artifacts.save(
        executionId,
        trustedOrganizationId,
        artifactRefs
      );
    }
    const extras = {
      diagnostics: diagnosticsFromJobSummary(
        executionId,
        errorMessage,
        {
          ...jobSummary,
          executionMode:
            jobSummary.executionMode ?? apiExecutionMode,
          providerMode:
            jobSummary.providerMode ??
            (apiExecutionMode === "stub" ? "stub" : "simulated"),
        },
        this.deps.nowIso(),
        jobId,
        status
      ),
      trace: {
        executionId,
        correlationId,
        stages: ["gateway", "queue", "worker", "integration"],
        durationMs: this.deps.clockMs() % 1000,
      },
      cost: {
        executionId,
        amount: cost ?? null,
        currency: cost != null ? "USD" : null,
        status: (cost != null ? "calculated" : "unknown") as
          | "calculated"
          | "unknown",
      },
      evaluation: {
        executionId,
        score: evaluationScore ?? null,
        humanReviewRequired:
          evaluationScore != null ? evaluationScore < 0.7 : false,
      },
      experience: {
        executionId,
        experienceIds: [],
        applied: false,
      },
    };
    this.extrasStore.set(executionId, extras);
    if (this.deps.persistence) {
      await this.deps.persistence.extras.save(executionId, trustedOrganizationId, extras);
    }

    if (this.deps.onIntelligenceSnapshot) {
      this.deps.onIntelligenceSnapshot(
        buildExecutionIntelligenceSnapshot({
          execution: resource,
          metadata: {
            ...(req.metadata ?? {}),
            budgetLimit: req.budgetLimit,
            tokenBudgetLimit: req.tokenBudgetLimit,
          },
          nowIso: this.deps.nowIso,
        })
      );
    }

    if (req.stream && this.deps.streaming) {
      const sub = this.deps.streaming.subscribe(executionId, "sse");
      if (sub.ok) {
        this.deps.streaming.push({
          subscriptionId: sub.value.subscriptionId,
          executionId,
          kind: "status",
          payload: { status },
        });
        this.deps.streaming.push({
          subscriptionId: sub.value.subscriptionId,
          executionId,
          kind: "progress",
          payload: { percent: status === "succeeded" ? 100 : 10 },
        });
        if (status === "succeeded" || status === "failed") {
          this.deps.streaming.push({
            subscriptionId: sub.value.subscriptionId,
            executionId,
            kind: "done",
            payload: { status },
          });
        }
      }
    }

    return success(resource);
  }

  async get(executionId: string, tenant: TenantContext): Promise<Result<ExecutionResource>> {
    if (this.deps.asyncCoordinator) {
      await this.deps.asyncCoordinator.reconcileExecution(executionId);
    }
    const got = await this.scoped(executionId, tenant);
    if (!got.ok || !this.deps.toolRuntime) return got;
    const records = await this.deps.toolRuntime.invocationStore.listByExecution(executionId);
    const awaiting = records.filter((record) => record.status === "awaiting_approval");
    const fromStore = buildPendingApprovals(awaiting);
    // M10.8 — stream path may persist pendingApprovals on the resource without tool-store rows yet.
    const pendingApprovals =
      fromStore.length > 0
        ? fromStore
        : got.value.pendingApprovals ?? [];
    const approvalRequired =
      got.value.status === "awaiting_approval" || pendingApprovals.length > 0;
    return success({
      ...got.value,
      approvalRequired: approvalRequired || undefined,
      toolInvocationKey: pendingApprovals[0]?.invocationId ?? (
        approvalRequired ? got.value.toolInvocationKey : undefined
      ),
      pendingApprovals: pendingApprovals.length ? pendingApprovals : undefined,
      result: approvalRequired
        ? {
            kind: "tool_approval_required",
            data: { pendingApprovals },
          }
        : got.value.result,
    });
  }

  async decideToolApproval(
    executionId: string,
    invocationKey: string,
    decision: "approve" | "reject",
    principal: AuthPrincipal,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (!this.deps.toolRuntime) {
      return failure(new ValidationError("Tool runtime is not configured"));
    }
    const approved = await approveToolInvocation({
      platform: this.deps.toolRuntime,
      organizationId: tenant.organizationId,
      executionId,
      invocationKey,
      principal,
      decision,
    });
    if (!approved.ok) return approved;

    const resumed = approved.value.resumed?.providerResult;
    const awaitingMore = resumed?.error?.code === "TOOL_APPROVAL_REQUIRED";
    const status: ExecutionResource["status"] = awaitingMore
      ? "awaiting_approval"
      : resumed
        ? resumed.success
          ? "succeeded"
          : "failed"
        : decision === "reject"
          ? "failed"
          : got.value.status;

    const runtimeOutput = (resumed?.response?.output ?? {}) as Record<string, unknown>;
    const structuredFromOrch =
      typeof (runtimeOutput as { structured?: unknown }).structured !== "undefined"
        ? (runtimeOutput as { structured?: unknown }).structured
        : undefined;
    const jobSummary: Record<string, unknown> = {
      ...(structuredFromOrch != null ? { structuredData: structuredFromOrch } : {}),
      ...(typeof runtimeOutput.content === "string"
        ? { resultText: runtimeOutput.content }
        : typeof runtimeOutput.text === "string"
          ? { resultText: runtimeOutput.text }
          : typeof runtimeOutput.message === "string"
            ? { resultText: runtimeOutput.message }
            : {}),
    };

    const records = await this.deps.toolRuntime.invocationStore.listByExecution(
      executionId
    );
    const pendingApprovals = buildPendingApprovals(records);

    const result = awaitingMore
      ? ({
          kind: "tool_approval_required" as const,
          data: { pendingApprovals },
        })
      : buildExecutionResultPayload({
          status,
          jobSummary,
          runtimeOutput,
        });

    const updated: ExecutionResource = {
      ...got.value,
      status,
      approvalRequired: awaitingMore || undefined,
      toolInvocationKey: awaitingMore
        ? pendingApprovals[0]?.invocationId ?? invocationKey
        : undefined,
      pendingApprovals: awaitingMore ? pendingApprovals : undefined,
      result,
      errorMessage:
        decision === "reject" && !resumed?.success
          ? resumed?.error?.message ?? "Tool approval rejected"
          : resumed?.error?.message,
      updatedAt: this.deps.nowIso(),
      completedAt:
        status === "awaiting_approval" || status === "running"
          ? undefined
          : this.deps.nowIso(),
    };
    this.executionStore.set(executionId, updated);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(updated);
    }
    return success(updated);
  }

  async cancel(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    const exec = got.value;
    if (exec.jobId && this.deps.distributed) {
      await this.deps.distributed.cancel(exec.jobId as never, "api_cancel");
    }
    const updated: ExecutionResource = {
      ...exec,
      status: "cancelled",
      updatedAt: this.deps.nowIso(),
      completedAt: this.deps.nowIso(),
    };
    this.executionStore.set(executionId, updated);
    if (this.deps.persistence) {
      await this.deps.persistence.executions.update(updated);
    }
    return success(updated);
  }

  async retry(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    return this.create(
      {
        prompt: got.value.promptPreview,
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId ?? got.value.workspaceId,
        capabilityId: got.value.capabilityId,
      },
      {
        principalId: tenant.userId ?? "retry",
        kind: "user",
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        roles: ["member"],
        userId: tenant.userId,
      }
    );
  }

  async history(tenant: TenantContext, limit = 50): Promise<Result<readonly ExecutionResource[]>> {
    if (this.deps.persistence) {
      const rows = await this.deps.persistence.executions.listByTenant(
        tenant.organizationId,
        limit
      );
      return success(
        rows.filter((e) => !tenant.workspaceId || e.workspaceId === tenant.workspaceId)
      );
    }
    const rows = [...this.executionStore.values()]
      .filter((e) => e.organizationId === tenant.organizationId)
      .filter((e) => !tenant.workspaceId || e.workspaceId === tenant.workspaceId)
      .slice(0, limit);
    return success(rows);
  }

  async artifacts(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<readonly ExecutionArtifactRef[]>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      return success(await this.deps.persistence.artifacts.list(executionId));
    }
    return success(this.artifactStore.get(executionId) ?? []);
  }

  async diagnostics(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionDiagnostics>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("diagnostics not found"));
      return success(extras.diagnostics);
    }
    return success(this.extrasStore.get(executionId)!.diagnostics);
  }

  async trace(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionTraceSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("trace not found"));
      return success(extras.trace);
    }
    return success(this.extrasStore.get(executionId)!.trace);
  }

  async cost(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionCostSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("cost not found"));
      return success(extras.cost);
    }
    return success(this.extrasStore.get(executionId)!.cost);
  }

  async evaluation(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionEvaluationSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("evaluation not found"));
      return success(extras.evaluation);
    }
    return success(this.extrasStore.get(executionId)!.evaluation);
  }

  async experience(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionExperienceSummary>> {
    const got = await this.scoped(executionId, tenant);
    if (!got.ok) return got;
    if (this.deps.persistence) {
      const extras = await this.deps.persistence.extras.get(executionId);
      if (!extras) return failure(new NotFoundError("experience not found"));
      return success(extras.experience);
    }
    return success(this.extrasStore.get(executionId)!.experience);
  }

  private async loadExecution(executionId: string): Promise<ExecutionResource | undefined> {
    // Prefer persistence when present — AsyncExecutionCoordinator updates the
    // durable/in-memory repository, not ExecutionApiService.executionStore.
    if (this.deps.persistence) {
      const persisted = await this.deps.persistence.executions.get(executionId);
      if (persisted) {
        this.executionStore.set(executionId, persisted);
        return persisted;
      }
    }
    return this.executionStore.get(executionId);
  }

  private async scoped(
    executionId: string,
    tenant: TenantContext
  ): Promise<Result<ExecutionResource>> {
    const exec = await this.loadExecution(executionId);
    if (!exec) return failure(new NotFoundError("execution not found"));
    if (exec.organizationId !== tenant.organizationId) {
      return failure(new AuthorizationError("tenant isolation violation"));
    }
    return success(exec);
  }
}

function mapJobStatus(status: string): ExecutionResource["status"] {
  switch (status) {
    case "queued":
    case "scheduled":
      return "queued";
    case "running":
    case "reserved":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "retrying":
      return "retrying";
    default:
      return "running";
  }
}
