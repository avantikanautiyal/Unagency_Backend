/**
 * Create-execution dispatch — stream handoff, async media lane,
 * sync distributed/integration/stub run, materialization, finalize.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { ServiceContextWorkflow } from "../../os/brief/engine/service-context-classifier";
import { runIntegrationViaControlPlane, resolveControlPlaneWorkspaceId } from "./integration-control-plane-runner";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../intelligence/shared/identifiers";
import type {
  ExecutionArtifactRef,
  ExecutionResource,
} from "../contracts";
import { buildExecutionIntelligenceSnapshot } from "../execution-intelligence/projection/build-snapshot";
import {
  logOsExecutionEvent,
  resolveProductMode,
  scenarioHintFromBrief,
  productModeAutoApprovesTools,
  defaultAsyncExecutionBoundary,
  osLifecycleFromApiStatus,
} from "../../os";
import { defaultGovernanceEngine } from "../../os/governance/types";
import { isAsyncExecutionRequest } from "../../intelligence/providers/async/coordination/async-execution-coordinator";
import { materializeSyncImageArtifacts } from "./sync-image-artifact-materializer";
import {
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../intelligence/providers/common/resolve-execution-modality";
import { fakeAsyncProviderId } from "../../intelligence/providers/async/fake/fake-async-provider";
import { buildExecutionResultPayload } from "./execution-result-payload";
import {
  buildPendingApprovals,
  type PendingToolApprovalPresentation,
} from "./tool-approval-presentation";
import { buildIntegrationJobSummary } from "../../infrastructure/execution/workers/integration-job-summary";
import {
  experienceSummaryFromJobSummary,
  diagnosticsFromJobSummary,
  mapJobStatus,
} from "./execution-summary-helpers";
import { finalizeExecutionGovernanceExtras, previewFromJobSummary } from "./execution-governance-extras";
import { buildWorkflowFollowUpFromMetadata } from "./workflow-follow-up";
import { maybeAutoDeliverOnSuccess } from "./auto-delivery-on-success";
import { autoApprovePendingToolInvocations } from "./auto-approve-pending-tools";
import {
  CANONICAL_INTEGRATION_MODE,
  CANONICAL_STREAM_PLANNING_MODE,
  buildCanonicalIntegrationRequest,
  extractCanonicalRouting,
  runCanonicalIntegration,
} from "./canonical-execution-spine";
import {
  buildIntegrationPlanningSnapshot,
  integrationPlanningSnapshotExtras,
} from "../../intelligence/integration/adapters/deferred-post-processing";
import type { ExecutionCreateHost } from "./execution-create-host";
import type { CreatePipelineState } from "./execution-create-state";

export async function runCreateDispatch(
  host: ExecutionCreateHost,
  state: CreatePipelineState
): Promise<Result<ExecutionResource>> {
  const req = state.req;
  const principal = state.principal;
  const capabilityIdRaw = state.capabilityIdRaw;
  const trustedOrganizationId = state.trustedOrganizationId;
  const workingMetadata = state.workingMetadata;
  const providerPrompt = state.providerPrompt;
  const requestFingerprint = state.requestFingerprint;
  const executionId = state.executionId;
  const correlationId = state.correlationId;
  const now = state.now;
  const structuredBrief = state.structuredBrief;
  const structuredBrandContext = state.structuredBrandContext;
  const structuredKnowledgeContext = state.structuredKnowledgeContext;
  const structuredExecutionPlan = state.structuredExecutionPlan;

  // Canonical stream handoff — OS ingress complete; defer provider execution to SSE path.
  if (workingMetadata?.canonicalStreamHandoff === true) {
    host.streamHandoffByExecutionId.set(executionId, {
      executionId,
      correlationId,
      trustedOrganizationId,
      providerPrompt,
      capabilityIdRaw,
      req,
      workingMetadata,
      structuredBrief,
      structuredBrandContext,
      structuredKnowledgeContext,
      structuredExecutionPlan,
      principal,
    });

    const streamResource: ExecutionResource = {
      executionId,
      status: "streaming",
      organizationId: trustedOrganizationId,
      workspaceId: req.workspaceId,
      capabilityId: req.capabilityId ?? capabilityIdRaw,
      correlationId,
      createdAt: now,
      updatedAt: now,
      promptPreview: req.prompt.slice(0, 120),
      result: { kind: "pending" },
    };

    const extrasPayload = {
      structuredBrief,
      structuredBrandContext,
      structuredKnowledgeContext,
      structuredExecutionPlan,
    };

    if (host.deps.persistence) {
      await host.deps.persistence.executions.save(streamResource);
      await host.deps.persistence.extras.save(
        executionId,
        trustedOrganizationId,
        {
          diagnostics: diagnosticsFromJobSummary(
            executionId,
            undefined,
            { executionMode: host.deps.executionMode ?? "stub", providerMode: "stream" },
            host.deps.nowIso(),
            undefined,
            "streaming"
          ),
          trace: {
            executionId,
            correlationId,
            stages: ["gateway", "brief", "brand", "knowledge", "execution_plan"],
            durationMs: 0,
          },
          cost: { executionId, amount: null, currency: null, status: "unknown" },
          evaluation: { executionId, score: null, humanReviewRequired: false },
          experience: { executionId, experienceIds: [], applied: false },
          ...extrasPayload,
        }
      );
    } else {
      host.executionStore.set(executionId, streamResource);
      host.extrasStore.set(executionId, {
        diagnostics: diagnosticsFromJobSummary(
          executionId,
          undefined,
          { executionMode: host.deps.executionMode ?? "stub", providerMode: "stream" },
          host.deps.nowIso(),
          undefined,
          "streaming"
        ),
        trace: {
          executionId,
          correlationId,
          stages: ["gateway", "brief", "brand", "knowledge", "execution_plan"],
          durationMs: 0,
        },
        cost: { executionId, amount: null, currency: null, status: "unknown" },
        evaluation: { executionId, score: null, humanReviewRequired: false },
        experience: { executionId, experienceIds: [], applied: false },
        ...extrasPayload,
      });
    }

    logOsExecutionEvent("execution.stream.handoff", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId: req.capabilityId,
      status: "streaming",
      lifecycle: "CONTEXT_ASSEMBLY",
    });

    return success(streamResource);
  }

  if (
    host.deps.asyncCoordinator &&
    isAsyncExecutionRequest({
      capabilityId: req.capabilityId,
      metadata: req.metadata,
      hasAsyncCoordinator: true,
      executionMode: host.deps.executionMode,
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
    let pipelineGovernanceAttached = false;
    let integrationPlanningSnapshotExtrasPayload:
      | Readonly<Record<string, unknown>>
      | undefined;

    // Canonical pipeline stages 1–10 before async media coordinator handoff.
    if (host.deps.integration) {
      const planningInput = {
        executionId,
        correlationId,
        trustedOrganizationId,
        providerPrompt,
        req,
        workingMetadata,
        structuredBrief,
        principal,
        mode: CANONICAL_STREAM_PLANNING_MODE as typeof CANONICAL_STREAM_PLANNING_MODE,
      };
      const planning = await runCanonicalIntegration(
        host.deps.integration,
        planningInput
      );
      if (planning.ok) {
        pipelineGovernanceAttached = true;
        integrationPlanningSnapshotExtrasPayload = integrationPlanningSnapshotExtras(
          buildIntegrationPlanningSnapshot(
            buildCanonicalIntegrationRequest(planningInput),
            planning.value
          )
        );
        const routing = extractCanonicalRouting(planning.value, {
          providerId: providerId || preferredProviderId,
          modelId: modelId || preferredModelId,
        });
        providerId = routing.providerId;
        modelId = routing.modelId;
        routingDecisionId = routing.routingDecisionId;
      }
    }

    const useSimulatedFakeLeaf =
      (host.deps.executionMode === "simulated" || host.deps.executionMode === "stub") &&
      (isVideoGenerationCapability(capabilityId) ||
        isImageGenerationCapability(capabilityId));

    if (useSimulatedFakeLeaf && !preferredProviderId) {
      // Credential-free M10.6 path — Model/Routing authority still owns LIVE video.
      providerId = String(fakeAsyncProviderId());
      modelId = "fake-async-model";
    } else if (isVideoGenerationCapability(capabilityId) && host.deps.videoRouter) {
      const routed = await host.deps.videoRouter.resolve({
        prompt: req.prompt,
        capabilityId,
        preferredProviderId,
        preferredModelId,
      });
      if (!routed.ok) {
        // Fall back to simulated fake leaf when LIVE video leaf unavailable.
        if (host.deps.executionMode !== "live") {
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
    } else if (isImageGenerationCapability(capabilityId) && host.deps.imageRouter) {
      const routed = host.deps.imageRouter.resolve({
        prompt: req.prompt,
        capabilityId,
        preferredProviderId,
        preferredModelId,
      });
      if (!routed.ok) {
        if (host.deps.executionMode !== "live") {
          providerId = String(fakeAsyncProviderId());
          modelId = "fake-async-model";
        } else {
          return routed;
        }
      } else {
        providerId = routed.value.providerId;
        modelId = routed.value.modelId;
        failoverChain = [...routed.value.failoverChain];
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
    if (host.deps.persistence) {
      await host.deps.persistence.executions.save(resource);
    } else {
      host.executionStore.set(executionId, resource);
    }

    const submit = await host.deps.asyncCoordinator.submitExecution({
      executionId,
      organizationId: trustedOrganizationId,
      workspaceId: req.workspaceId,
      prompt: providerPrompt,
      correlationId,
      providerId,
      modelId,
      capabilityId,
      payload: {
        prompt: providerPrompt,
        ...(req.metadata?.payload as Record<string, unknown> | undefined),
        ...(Array.isArray(req.metadata?.assets) ? { assets: req.metadata.assets } : {}),
        ...(req.metadata?.audio ? { audio: req.metadata.audio } : {}),
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
      if (host.deps.persistence) await host.deps.persistence.executions.update(failed);
      else host.executionStore.set(executionId, failed);
      return submit;
    }

    if (req.idempotencyKey?.trim() && host.deps.persistence) {
      const idemRecord = { fingerprint: requestFingerprint, executionId };
      await host.deps.persistence.idempotency.set(
        `${trustedOrganizationId}:${req.idempotencyKey.trim()}`,
        idemRecord
      );
    }

    const asyncLaneBase = defaultAsyncExecutionBoundary.attachAsyncExecution({
      executionId,
      organizationId: trustedOrganizationId,
      requestId: correlationId,
      capabilityId,
    });
    const asyncLane = {
      ...asyncLaneBase,
      governanceAttached: pipelineGovernanceAttached,
      notes: pipelineGovernanceAttached
        ? "Canonical IntegrationPipeline stages 1–10 applied before async media coordinator."
        : asyncLaneBase.notes,
    };
    logOsExecutionEvent("execution.async_lane", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId,
      status: "waiting_provider",
      lifecycle: asyncLane.lifecycle,
    });
    if (host.deps.persistence) {
      await host.deps.persistence.extras.save(executionId, trustedOrganizationId, {
        diagnostics: diagnosticsFromJobSummary(
          executionId,
          undefined,
          {
            executionMode: host.deps.executionMode ?? "stub",
            providerMode: "async",
          },
          host.deps.nowIso(),
          undefined,
          "waiting_provider"
        ),
        trace: {
          executionId,
          correlationId,
          stages: pipelineGovernanceAttached
            ? [
                "gateway",
                "brief",
                "brand",
                "knowledge",
                "execution_plan",
                "integration_pipeline_planning",
                "async_media_coordinator",
              ]
            : ["gateway", "async_media_coordinator"],
          durationMs: 0,
        },
        cost: {
          executionId,
          amount: null,
          currency: null,
          status: "unknown",
        },
        evaluation: {
          executionId,
          score: null,
          humanReviewRequired: false,
        },
        experience: {
          executionId,
          experienceIds: [],
          applied: false,
        },
        osLifecycle: asyncLane.lifecycle,
        governance: defaultGovernanceEngine.decide({
          evaluationScore: null,
          evaluationPlaceholder: true,
          humanReviewFlag: false,
          providerSuccess: true,
          nowIso: host.deps.nowIso,
        }),
        asyncLane,
        ...(structuredBrief ? { structuredBrief } : {}),
        ...(structuredBrandContext ? { structuredBrandContext } : {}),
        ...(structuredKnowledgeContext ? { structuredKnowledgeContext } : {}),
        ...(structuredExecutionPlan ? { structuredExecutionPlan } : {}),
        ...(integrationPlanningSnapshotExtrasPayload ?? {}),
      });
    } else {
      host.extrasStore.set(executionId, {
        diagnostics: diagnosticsFromJobSummary(
          executionId,
          undefined,
          {
            executionMode: host.deps.executionMode ?? "stub",
            providerMode: "async",
          },
          host.deps.nowIso(),
          undefined,
          "waiting_provider"
        ),
        trace: {
          executionId,
          correlationId,
          stages: pipelineGovernanceAttached
            ? [
                "gateway",
                "brief",
                "brand",
                "knowledge",
                "execution_plan",
                "integration_pipeline_planning",
                "async_media_coordinator",
              ]
            : ["gateway", "async_media_coordinator"],
          durationMs: 0,
        },
        cost: {
          executionId,
          amount: null,
          currency: null,
          status: "unknown",
        },
        evaluation: {
          executionId,
          score: null,
          humanReviewRequired: false,
        },
        experience: {
          executionId,
          experienceIds: [],
          applied: false,
        },
        osLifecycle: asyncLane.lifecycle,
        ...(structuredBrief ? { structuredBrief } : {}),
        ...(structuredBrandContext ? { structuredBrandContext } : {}),
        ...(structuredKnowledgeContext ? { structuredKnowledgeContext } : {}),
        ...(structuredExecutionPlan ? { structuredExecutionPlan } : {}),
        ...(integrationPlanningSnapshotExtrasPayload ?? {}),
      });
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
  let runtimeOutputForMedia: Readonly<Record<string, unknown>> | undefined;
  let mediaArtifactIds: readonly string[] | undefined;
  const apiExecutionMode = host.deps.executionMode ?? "stub";
  const integrationMode = CANONICAL_INTEGRATION_MODE;

  if (host.deps.distributed) {
    const enq = await host.deps.distributed.enqueue({
      payload: {
        rawPrompt: providerPrompt,
        organizationId: trustedOrganizationId,
        workspaceId: resolveControlPlaneWorkspaceId(req.workspaceId),
        budgetLimit: req.budgetLimit,
        tokenBudgetLimit: req.tokenBudgetLimit,
        correlationId,
        capabilityHint: req.capabilityId,
        scenarioHint: structuredBrief
          ? scenarioHintFromBrief(structuredBrief)
          : undefined,
        metadata: {
          ...(req.metadata ?? {}),
          ...(workingMetadata ?? {}),
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
    if (host.deps.autoTick !== false) {
      host.deps.distributed.registerWorker("execution", 4);
      const ownJobId = enq.value.jobId;
      const live = (host.deps.executionMode ?? "stub") === "live";
      const isLongRunningMedia =
        isImageGenerationCapability(capabilityIdRaw) ||
        isVideoGenerationCapability(capabilityIdRaw);
      // LIVE image/video can exceed the mobile HTTP timeout — tick in background.
      // Text (Enhance, copy) must finish so GET/create return resultText.
      if (live && isLongRunningMedia) {
        void host.deps.distributed.tick(4).catch((err) => {
          logOsExecutionEvent("execution.background_tick.failed", {
            requestId: correlationId,
            executionId,
            organizationId: trustedOrganizationId,
            status: "failed",
            errorCode: err instanceof Error ? err.message : String(err),
          });
        });
      } else {
        await host.deps.distributed.tick(1);
      }
      const job = host.deps.distributed.getJob(ownJobId);
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
  } else if (host.deps.integration) {
    status = "running";
    const capabilityForGateway =
      capabilityIdRaw?.trim() || "text.generate";
    const controlPlaneWorkspaceId = resolveControlPlaneWorkspaceId(req.workspaceId);
    const run = await runIntegrationViaControlPlane({
      gateway: host.intelligenceGateway,
      integration: host.deps.integration,
      request: {
        requestId: executionId,
        rawPrompt: providerPrompt,
        organizationId: asOrganizationId(trustedOrganizationId),
        workspaceId: asWorkspaceId(controlPlaneWorkspaceId),
        budgetLimit: req.budgetLimit,
        tokenBudgetLimit: req.tokenBudgetLimit,
        correlationId,
        mode: CANONICAL_INTEGRATION_MODE,
        scenarioHint: structuredBrief
          ? scenarioHintFromBrief(structuredBrief)
          : undefined,
        metadata: {
          ...(req.metadata ?? {}),
          ...(workingMetadata ?? {}),
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
      },
      capabilityId: capabilityForGateway,
      organizationId: trustedOrganizationId,
      workspaceId: controlPlaneWorkspaceId,
      apiExecutionId: executionId,
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
    completedAt = awaitingToolApproval ? undefined : host.deps.nowIso();
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
    runtimeOutputForMedia = runtimeOutput;
    jobSummary = {
      ...buildIntegrationJobSummary({
        report: run.value,
        executionMode: apiExecutionMode === "live" ? "live" : "simulated",
        durationMs: run.value.durationMs,
      }),
      contextSnapshotId: eiAttrs.contextSnapshotId,
      brandEnrichmentId: eiAttrs.brandEnrichmentId,
      brandBrainVersion: eiAttrs.brandBrainVersion,
      knowledgeSnapshotId: eiAttrs.knowledgeSnapshotId,
      promptCompilationId: eiAttrs.promptCompilationId,
    };
  } else {
    // Platform-local completion (tests / degraded mode) — still API-mediated.
    status = "succeeded";
    completedAt = now;
    cost = undefined;
    evaluationScore = undefined;
  }

  const resolvedProductMode = resolveProductMode(workingMetadata ?? req.metadata);
  if (
    status === "awaiting_approval" &&
    productModeAutoApprovesTools(resolvedProductMode) &&
    host.deps.toolRuntime
  ) {
    const autoApproved = await autoApprovePendingToolInvocations({
      platform: host.deps.toolRuntime,
      organizationId: trustedOrganizationId,
      executionId,
      principal,
      nowIso: host.deps.nowIso,
    });
    if (autoApproved.ok) {
      status = autoApproved.value.status;
      approvalRequired = autoApproved.value.approvalRequired;
      toolInvocationKey = autoApproved.value.toolInvocationKey;
      errorMessage = autoApproved.value.errorMessage;
      completedAt = autoApproved.value.completedAt ?? completedAt;
      jobSummary = {
        ...jobSummary,
        ...autoApproved.value.jobSummary,
        awaitingToolApproval: false,
      };
      if (autoApproved.value.runtimeOutput) {
        runtimeOutputForMedia = autoApproved.value.runtimeOutput;
      }
      logOsExecutionEvent("execution.tool_auto_approved", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status,
      });
    }
  }

  let result = buildExecutionResultPayload({
    status,
    jobSummary,
    runtimeOutput: runtimeOutputForMedia,
  });

  const summaryArtifactIds = Array.isArray(jobSummary.mediaArtifactIds)
    ? jobSummary.mediaArtifactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];

  if (status === "succeeded" && summaryArtifactIds.length > 0) {
    mediaArtifactIds = summaryArtifactIds;
    result = {
      kind: "artifact",
      data: { artifactIds: [...summaryArtifactIds] },
    };
  } else if (
    status === "succeeded" &&
    isImageGenerationCapability(capabilityIdRaw) &&
    host.deps.asyncMedia
  ) {
    const materialized = await materializeSyncImageArtifacts({
      asyncMedia: host.deps.asyncMedia,
      executionId,
      organizationId: trustedOrganizationId,
      providerId: String(
        jobSummary.providerId ??
          jobSummary.routedProviderId ??
          jobSummary.provider ??
          req.providerId ??
          workingMetadata?.preferredProviderId ??
          "provider.unknown"
      ),
      modelId: String(
        jobSummary.modelId ??
          jobSummary.routedModelId ??
          jobSummary.model ??
          req.modelId ??
          workingMetadata?.preferredModelId ??
          "unknown"
      ),
      capabilityId: capabilityIdRaw || "image.generate",
      runtimeOutput: runtimeOutputForMedia,
      createId: host.deps.createId,
    });
    if (materialized.ok && materialized.value.length > 0) {
      mediaArtifactIds = materialized.value;
      result = {
        kind: "artifact",
        data: { artifactIds: [...materialized.value] },
      };
      logOsExecutionEvent("execution.sync_image.materialized", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "succeeded",
      });
    } else {
      const reason =
        typeof jobSummary.mediaMaterializationError === "string"
          ? jobSummary.mediaMaterializationError
          : !materialized.ok
            ? materialized.error.message
            : "no artifact ids";
      logOsExecutionEvent("execution.sync_image.materialization_failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "failed",
        errorCode: reason,
      });
      if (!errorMessage) {
        errorMessage = `Image generated but media artifact could not be stored: ${reason}`;
      }
    }
  } else if (
    status === "succeeded" &&
    isImageGenerationCapability(capabilityIdRaw) &&
    !host.deps.asyncMedia
  ) {
    logOsExecutionEvent("execution.sync_image.media_disabled", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: "warning",
    });
    if (!errorMessage) {
      errorMessage =
        "Image providers ran but media delivery is disabled (ENTERPRISE_ASYNC_MEDIA_ENABLED)";
    }
  }

  // Presentation / document structured plans → PPTX + PDF for in-app preview + download.
  if (status === "succeeded" && host.deps.asyncMedia) {
    try {
      const {
        materializeDocumentExports,
        resolveDocumentExportKind,
      } = await import("./document-export-materializer");
      const structuredCandidate =
        (result.kind === "structured" ? result.data : undefined) ??
        runtimeOutputForMedia?.structured ??
        runtimeOutputForMedia?.structuredOutput ??
        runtimeOutputForMedia?.data;
      const exportKind = resolveDocumentExportKind({
        outputKind:
          typeof workingMetadata?.outputKind === "string"
            ? workingMetadata.outputKind
            : undefined,
        mediaKind:
          typeof workingMetadata?.mediaKind === "string"
            ? workingMetadata.mediaKind
            : undefined,
        data: structuredCandidate,
      });
      if (exportKind) {
        const exported = await materializeDocumentExports({
          asyncMedia: host.deps.asyncMedia,
          executionId,
          organizationId: trustedOrganizationId,
          exportKind,
          runtimeOutput: runtimeOutputForMedia,
          jobSummary,
          createId: host.deps.createId,
          providerId: String(
            jobSummary.providerId ??
              workingMetadata?.preferredProviderId ??
              "provider.unagency"
          ),
          modelId: String(
            jobSummary.modelId ??
              workingMetadata?.preferredModelId ??
              "document-export"
          ),
        });
        if (exported.ok) {
          mediaArtifactIds = [
            ...new Set([
              ...(mediaArtifactIds ?? []),
              ...exported.value.artifactIds,
            ]),
          ];
          result = {
            kind: "structured",
            data: {
              ...(typeof exported.value.plan === "object" &&
              exported.value.plan
                ? (exported.value.plan as Record<string, unknown>)
                : {}),
              exportKind,
              pdfArtifactId: exported.value.pdfArtifactId,
              pptxArtifactId: exported.value.pptxArtifactId,
              downloadFormats: ["pdf", "pptx"],
            },
          };
          logOsExecutionEvent("execution.document_export.materialized", {
            requestId: correlationId,
            executionId,
            organizationId: trustedOrganizationId,
            status: "succeeded",
          });
        } else {
          logOsExecutionEvent("execution.document_export.failed", {
            requestId: correlationId,
            executionId,
            organizationId: trustedOrganizationId,
            status: "failed",
            errorCode: exported.error.message,
          });
        }
      }
    } catch (err) {
      logOsExecutionEvent("execution.document_export.skipped", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "skipped",
        errorCode: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let pendingApprovals: readonly PendingToolApprovalPresentation[] | undefined;
  if (status === "awaiting_approval" && host.deps.toolRuntime) {
    const records = await host.deps.toolRuntime.invocationStore.listByExecution(
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
    updatedAt: host.deps.nowIso(),
    completedAt,
    promptPreview: req.prompt.slice(0, 120),
    cost,
    evaluationScore,
    errorMessage,
    approvalRequired: approvalRequired || undefined,
    toolInvocationKey,
    pendingApprovals,
    artifactIds: mediaArtifactIds,
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
  host.executionStore.set(executionId, resource);
  if (host.deps.persistence) {
    await host.deps.persistence.executions.save(resource);
  }
  if (req.idempotencyKey?.trim()) {
    const idemRecord = { fingerprint: requestFingerprint, executionId };
    const idemStoreKey = `${trustedOrganizationId}:${req.idempotencyKey.trim()}`;
    if (host.deps.persistence) {
      await host.deps.persistence.idempotency.set(idemStoreKey, idemRecord);
    } else {
      host.idempotencyIndex.set(idemStoreKey, idemRecord);
    }
  }
  const tokensUsed = Number(jobSummary.totalTokens ?? 0);
  if (tokensUsed > 0) {
    if (host.deps.persistence) {
      await host.deps.persistence.tenantUsage.addTokens(trustedOrganizationId, tokensUsed);
    } else {
      const prev = host.tenantTokenUsage.get(trustedOrganizationId) ?? 0;
      host.tenantTokenUsage.set(trustedOrganizationId, prev + tokensUsed);
    }
  }
  const artifactRefs: ExecutionArtifactRef[] = mediaArtifactIds?.length
    ? mediaArtifactIds.map((artifactId) => ({
        artifactId,
        kind: "media",
        label: "image_output",
      }))
    : [
        {
          artifactId: host.deps.createId("art"),
          kind: "response",
          label: "primary_output",
        },
      ];
  host.artifactStore.set(executionId, artifactRefs);
  // MediaArtifactService.finalize already persisted blob-linked refs — do not
  // overwrite them with a stub response artifact.
  if (host.deps.persistence && !mediaArtifactIds?.length) {
    await host.deps.persistence.artifacts.save(
      executionId,
      trustedOrganizationId,
      artifactRefs
    );
  }
  const providerSucceeded =
    status === "succeeded" || status === "awaiting_approval";
  const phase6Governance = finalizeExecutionGovernanceExtras({
    governanceFinalize: host.governanceFinalize,
    organizationId: trustedOrganizationId,
    executionId,
    capabilityId: capabilityIdRaw || "text.generate",
    objective:
      structuredBrief?.objective?.trim() ||
      req.prompt.slice(0, 500),
    preview: previewFromJobSummary(jobSummary),
    brandTone: structuredBrandContext?.tone?.tone,
    planId: structuredExecutionPlan?.id,
    planVersion: structuredExecutionPlan?.planVersion,
    providerSuccess: providerSucceeded,
    fallbackEvaluationScore: evaluationScore ?? null,
    productMode: resolvedProductMode,
    nowIso: host.deps.nowIso,
    createId: host.deps.createId,
  });

  const workflowFromMeta = workingMetadata?.serviceContextWorkflow as
    | ServiceContextWorkflow
    | undefined;
  const workflowFollowUp = workflowFromMeta
    ? buildWorkflowFollowUpFromMetadata({
        executionId,
        prompt: req.prompt,
        workflow: workflowFromMeta,
        brandId:
          typeof workingMetadata?.brandId === "string"
            ? workingMetadata.brandId
            : typeof req.metadata?.brandId === "string"
              ? req.metadata.brandId
              : undefined,
        nowIso: host.deps.nowIso,
      })
    : undefined;

  let autoDelivery: { deliveryId?: string; error?: string } | undefined;
  if (status === "succeeded" && artifactRefs.length > 0) {
    autoDelivery = await maybeAutoDeliverOnSuccess({
      deliveryService: host.deliveryService,
      organizationId: trustedOrganizationId,
      executionId,
      artifactRefs,
      nowIso: host.deps.nowIso,
      createId: host.deps.createId,
    });
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
      host.deps.nowIso(),
      jobId,
      status
    ),
    trace: {
      executionId,
      correlationId,
      stages: ["gateway", "queue", "worker", "integration"],
      durationMs: host.deps.clockMs() % 1000,
    },
    cost: {
      executionId,
      amount: cost ?? null,
      currency: cost != null ? "USD" : null,
      status: (cost != null ? "calculated" : "unknown") as
        | "calculated"
        | "unknown",
    },
    evaluation: phase6Governance.evaluation,
    experience: experienceSummaryFromJobSummary(executionId, jobSummary),
    osLifecycle: osLifecycleFromApiStatus(status),
    governance: phase6Governance.governance,
    ...(workflowFollowUp ? { workflowFollowUp } : {}),
    ...(phase6Governance.humanReview
      ? {
          pendingHumanReview: {
            reviewId: phase6Governance.humanReview.reviewId,
            reason: phase6Governance.humanReview.reason,
            requestedAt: phase6Governance.humanReview.requestedAt,
          },
        }
      : {}),
    ...(autoDelivery ? { autoDelivery } : {}),
    ...(structuredBrief ? { structuredBrief } : {}),
    ...(structuredBrandContext ? { structuredBrandContext } : {}),
    ...(structuredKnowledgeContext ? { structuredKnowledgeContext } : {}),
    ...(structuredExecutionPlan ? { structuredExecutionPlan } : {}),
  };
  host.extrasStore.set(executionId, extras);
  logOsExecutionEvent("execution.finalize", {
    requestId: correlationId,
    executionId,
    organizationId: trustedOrganizationId,
    capabilityId: capabilityIdRaw,
    status,
    lifecycle: extras.osLifecycle,
    errorCode: errorMessage ? "execution_failed" : undefined,
  });
  if (host.deps.persistence) {
    await host.deps.persistence.extras.save(executionId, trustedOrganizationId, extras);
  }

  if (host.deps.onIntelligenceSnapshot) {
    host.deps.onIntelligenceSnapshot(
      buildExecutionIntelligenceSnapshot({
        execution: resource,
        metadata: {
          ...(req.metadata ?? {}),
          budgetLimit: req.budgetLimit,
          tokenBudgetLimit: req.tokenBudgetLimit,
        },
        nowIso: host.deps.nowIso,
      })
    );
  }

  if (req.stream && host.deps.streaming) {
    const sub = host.deps.streaming.subscribe(executionId, "sse");
    if (sub.ok) {
      host.deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId,
        kind: "status",
        payload: { status },
      });
      host.deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId,
        kind: "progress",
        payload: { percent: status === "succeeded" ? 100 : 10 },
      });
      if (status === "succeeded" || status === "failed") {
        host.deps.streaming.push({
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
