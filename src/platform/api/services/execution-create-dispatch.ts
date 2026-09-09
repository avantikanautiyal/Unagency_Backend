/**
 * Create-execution dispatch — stream handoff, async media lane,
 * sync distributed/integration/stub run, materialization, finalize.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { ServiceContextWorkflow } from "../../config/service-context-classifier";

function conversationFieldsFromMetadata(
  metadata?: Readonly<Record<string, unknown>>
): Pick<ExecutionResource, "conversationId" | "channelId"> {
  const conversationId =
    typeof metadata?.conversationId === "string"
      ? metadata.conversationId.trim()
      : "";
  const channelId =
    typeof metadata?.channelId === "string" ? metadata.channelId.trim() : "";
  return {
    ...(conversationId ? { conversationId } : {}),
    ...(channelId ? { channelId } : {}),
  };
}

/** Backfill video wire params from product format when client metadata omits them. */
function resolveAsyncVideoPayloadFromMetadata(
  metadata?: Readonly<Record<string, unknown>>
): {
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
} {
  if (!metadata) return {};
  const format =
    typeof metadata.format === "string" ? metadata.format : undefined;
  const service =
    typeof metadata.service === "string" ? metadata.service : undefined;
  const subtype =
    typeof metadata.subtype === "string" ? metadata.subtype : undefined;
  const aspectRatio =
    typeof metadata.aspectRatio === "string"
      ? metadata.aspectRatio
      : aspectRatioForFormat(format);
  let duration: number | undefined;
  if (metadata.duration != null) {
    const raw =
      typeof metadata.duration === "number"
        ? metadata.duration
        : Number(String(metadata.duration).replace(/s$/i, ""));
    if (Number.isFinite(raw)) duration = raw;
  } else {
    duration = durationForFormat(format, service, subtype);
  }
  const resolution =
    typeof metadata.resolution === "string" ? metadata.resolution : undefined;
  return {
    ...(duration != null ? { duration } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

/** Seed image wire aspectRatio from Spec / format when client omits it. */
function resolveAsyncImagePayloadFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): { aspectRatio?: string } {
  if (!metadata) return {};
  if (typeof metadata.aspectRatio === "string" && metadata.aspectRatio.trim()) {
    return { aspectRatio: metadata.aspectRatio.trim() };
  }
  const payload =
    metadata.payload && typeof metadata.payload === "object"
      ? (metadata.payload as Record<string, unknown>)
      : undefined;
  if (typeof payload?.aspectRatio === "string" && payload.aspectRatio.trim()) {
    return { aspectRatio: payload.aspectRatio.trim() };
  }
  const format =
    typeof metadata.format === "string" ? metadata.format : undefined;
  const fromFormat = aspectRatioForFormat(format);
  if (fromFormat) return { aspectRatio: fromFormat };
  return {};
}

import { runDirectProviderExecution, resolveControlPlaneWorkspaceId } from "./integration-control-plane-runner";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
import type {
  ExecutionArtifactRef,
  ExecutionResource,
  ExecutionEvaluationSummary,
} from "../contracts";
import {
  logOsExecutionEvent,
  resolveProductMode,
  parseProductMode,
  productModeAutoApprovesTools,
  defaultAsyncExecutionBoundary,
  osLifecycleFromApiStatus,
} from "../../os";
import { defaultGovernanceEngine } from "../../os/governance/types";
import { isAsyncExecutionRequest } from "../../providers/async/coordination/async-execution-coordinator";
import { materializeSyncImageArtifacts } from "./sync-image-artifact-materializer";
import {
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../providers/common/resolve-execution-modality";
import { fakeAsyncProviderId } from "../../providers/async/fake/fake-async-provider";
import {
  buildExecutionResultPayload,
  mergeExportArtifactsIntoResult,
} from "./execution-result-payload";
import {
  buildPendingApprovals,
  type PendingToolApprovalPresentation,
} from "./tool-approval-presentation";
import { buildIntegrationJobSummary } from "../../infrastructure/execution/workers/integration-job-summary";
import { deriveFinalizeExecutionCost } from "../../accounting/cost/finalize-execution-cost";
import { asJobId, type JobId } from "../../infrastructure/execution/contracts/job";
import { applyWebsiteExportToExecution } from "./website-export-materializer";
import { isWebsiteGenerationMetadata, isLongRunningPresentationMetadata, isLongRunningDocumentMetadata } from "./execution-thin-path";
import {
  aspectRatioForFormat,
  durationForFormat,
} from "../../os/contracts/output-contracts/format-overlays";
import { failoverChainFromMetadata, resolveAsyncMediaRoutingPins } from "./async-media-routing-pins";
import {
  experienceSummaryFromJobSummary,
  diagnosticsFromJobSummary,
  mapJobStatus,
} from "./execution-summary-helpers";
import { finalizeExecutionGovernanceExtras, previewFromJobSummary, validationContextFromExecution } from "./execution-governance-extras";
import { hookProductionEvidenceAfterFinalize } from "../../providers/routing/performance/benchmark/production/production-evidence-hook";
import {
  readExecutionSpecSnapshot,
  resolveBriefObjectiveFromMetadata,
} from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import { inferPresentDeliverableFormatsFromExecution } from "../../collaboration/conversational-task-intelligence/present-deliverable-formats";
import { pickRetryableCreateMetadata } from "./execution-retry-handoff";
import {
  recordProviderDispatchFromSummary,
  recordWebsiteMaterializationTrace,
} from "../../os/observability/execution-trace";
import {
  continuityPostGuardExtras,
  extractContinuityGuardContext,
  runContinuityPostGuards,
  type ContinuityPostGuardReport,
} from "../../os/creative";
import { continuitySnapshotForExtras } from "../../os/creative/refine-packet-continuity";
import { buildContinuityObservabilitySummary } from "../../os/creative/continuity-product-ux";
import { buildWorkflowFollowUpFromMetadata } from "./workflow-follow-up";
import { maybeAutoDeliverOnSuccess } from "./auto-delivery-on-success";
import { applyVisualFieldGuideEvidenceAfterImage } from "../../config/format-production-spec";
import { autoApprovePendingToolInvocations } from "./auto-approve-pending-tools";
import { CANONICAL_INTEGRATION_MODE } from "./canonical-execution-spine";
import type { ExecutionCreateHost, ExecutionExtrasRecord } from "./execution-create-host";
import type { CreatePipelineState } from "./execution-create-state";

function metadataBrandAssetIds(
  metadata: Readonly<Record<string, unknown>> | undefined,
): string[] {
  const raw = metadata?.assetIds;
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const logo =
    typeof metadata?.brandLogoAssetId === "string"
      ? metadata.brandLogoAssetId.trim()
      : typeof metadata?.logoAssetId === "string"
        ? metadata.logoAssetId.trim()
        : "";
  return logo ? [logo] : [];
}

function resolveProductionComplianceFormats(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly structuredData?: unknown;
  readonly preview?: string;
}) {
  return inferPresentDeliverableFormatsFromExecution({
    metadata: input.metadata,
    structuredData: input.structuredData,
    previewText: input.preview,
  });
}

/** execution.brandId is the only creative ownership SoT (confirmed in prepass). */
function resolveExecutionBrandId(
  workingMetadata: Record<string, unknown> | undefined,
  reqMetadata: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  if (
    typeof workingMetadata?.brandId === "string" &&
    workingMetadata.brandId.trim()
  ) {
    return workingMetadata.brandId.trim();
  }
  if (typeof reqMetadata?.brandId === "string" && reqMetadata.brandId.trim()) {
    return reqMetadata.brandId.trim();
  }
  return undefined;
}

export async function runCreateDispatch(
  host: ExecutionCreateHost,
  state: CreatePipelineState
): Promise<Result<ExecutionResource>> {
  const req = state.req;
  const principal = state.principal;
  const capabilityIdRaw = state.capabilityIdRaw;
  const trustedOrganizationId = state.trustedOrganizationId;
  let workingMetadata = state.workingMetadata;
  const providerPrompt = state.providerPrompt;
  const requestFingerprint = state.requestFingerprint;
  const executionId = state.executionId;
  const correlationId = state.correlationId;
  const now = state.now;
  const executionBrandId = resolveExecutionBrandId(
    workingMetadata,
    req.metadata
  );

  // Canonical stream handoff — defer provider execution to SSE path.
  if (workingMetadata?.canonicalStreamHandoff === true) {
    host.streamHandoffByExecutionId.set(executionId, {
      executionId,
      correlationId,
      trustedOrganizationId,
      providerPrompt,
      capabilityIdRaw,
      req,
      workingMetadata,
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
      ...(executionBrandId ? { brandId: executionBrandId } : {}),
      ...conversationFieldsFromMetadata(req.metadata),
      result: { kind: "pending" },
    };

    const extrasPayload = {};

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
            stages: ["gateway", "direct_provider"],
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
          stages: ["gateway", "matrix_route", "stream"],
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
    const {
      preferredProviderId,
      preferredModelId,
      prepassPinned,
    } = resolveAsyncMediaRoutingPins({
      reqProviderId: req.providerId,
      reqModelId: req.modelId,
      workingMetadata,
      metadata: req.metadata,
    });

    // Prepass owns matrix/modality routing. Honor pins; do not re-route when complete.
    let providerId = preferredProviderId ?? "";
    let modelId = preferredModelId ?? "";
    let routingDecisionId: string | undefined;
    let failoverChain: { providerId: string; modelId: string }[] = [];

    const useSimulatedFakeLeaf =
      (host.deps.executionMode === "simulated" || host.deps.executionMode === "stub") &&
      (isVideoGenerationCapability(capabilityId) ||
        isImageGenerationCapability(capabilityId));

    if (useSimulatedFakeLeaf && !preferredProviderId) {
      // Credential-free M10.6 path — Model/Routing authority still owns LIVE video.
      providerId = String(fakeAsyncProviderId());
      modelId = "fake-async-model";
    } else if (prepassPinned) {
      providerId = preferredProviderId!;
      modelId = preferredModelId!;
      const fromWorking = failoverChainFromMetadata(workingMetadata);
      failoverChain = fromWorking.length
        ? fromWorking
        : failoverChainFromMetadata(req.metadata);
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
          "async media execution requires prepass routing pins or a modality router"
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
      ...(executionBrandId ? { brandId: executionBrandId } : {}),
      ...conversationFieldsFromMetadata(req.metadata),
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
        ...resolveAsyncVideoPayloadFromMetadata(req.metadata),
        ...(isImageGenerationCapability(capabilityId)
          ? resolveAsyncImagePayloadFromMetadata(
              workingMetadata ?? req.metadata,
            )
          : {}),
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

    const asyncLane = defaultAsyncExecutionBoundary.attachAsyncExecution({
      executionId,
      organizationId: trustedOrganizationId,
      requestId: correlationId,
      capabilityId,
    });
    logOsExecutionEvent("execution.async_lane", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId,
      status: "waiting_provider",
      lifecycle: asyncLane.lifecycle,
    });
    const asyncTraceStages = [
      "gateway",
      "modality_route",
      "async_media_coordinator",
    ];
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
          stages: asyncTraceStages,
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
          stages: asyncTraceStages,
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
  let usedSyncDirectPath = false;
  /** True when create returns before the distributed job finishes (website/deck/doc/media). */
  let deferredLongRunning = false;
  const apiExecutionMode = host.deps.executionMode ?? "stub";
  const integrationMode = CANONICAL_INTEGRATION_MODE;

  if (host.deps.distributed) {
    const routeVisualAction =
      workingMetadata?.productAction === "route_visual" ||
      workingMetadata?.productAction === "route_visual_refine";
    const enq = await host.deps.distributed.enqueue({
      ...(routeVisualAction
        ? {
            retryPolicy: {
              strategy: "exponential" as const,
              maxAttempts: 1,
              baseDelayMs: 0,
              maxDelayMs: 0,
            },
          }
        : {}),
      payload: {
        rawPrompt: providerPrompt,
        organizationId: trustedOrganizationId,
        workspaceId: resolveControlPlaneWorkspaceId(req.workspaceId),
        budgetLimit: req.budgetLimit,
        tokenBudgetLimit: req.tokenBudgetLimit,
        correlationId,
        capabilityHint: req.capabilityId,
        scenarioHint: undefined,
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
          brandId: executionBrandId,
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
      const isLongRunningWebsite = isWebsiteGenerationMetadata({
        ...(req.metadata ?? {}),
        ...(workingMetadata ?? {}),
      });
      const isLongRunningPresentation = isLongRunningPresentationMetadata({
        ...(req.metadata ?? {}),
        ...(workingMetadata ?? {}),
      });
      const isLongRunningDocument = isLongRunningDocumentMetadata({
        ...(req.metadata ?? {}),
        ...(workingMetadata ?? {}),
      });
      // LIVE image/video/website/pitch-deck/brochure can exceed the mobile HTTP timeout — tick in background.
      // Short copy/enhance must finish so GET/create return resultText.
      if (
        live &&
        (isLongRunningMedia ||
          isLongRunningWebsite ||
          isLongRunningPresentation ||
          isLongRunningDocument)
      ) {
        deferredLongRunning = true;
        void (async () => {
          try {
            const deadlineMs = host.deps.clockMs() + 25 * 60 * 1000;
            while (host.deps.clockMs() < deadlineMs) {
              await host.deps.distributed!.tick(4);
              const liveJob = host.deps.distributed!.getJob(ownJobId);
              if (!liveJob.ok || !liveJob.value) break;
              const liveSummary = liveJob.value.resultSummary ?? {};
              if (
                isTerminalJobStatus(liveJob.value.status) ||
                liveSummary.awaitingToolApproval === true
              ) {
                break;
              }
              await new Promise((r) => setTimeout(r, 250));
            }
            const after = host.deps.distributed!.getJob(ownJobId);
            const afterSummary = after.ok
              ? (after.value?.resultSummary ?? {})
              : {};
            const timedOut =
              !after.ok ||
              !after.value ||
              (!isTerminalJobStatus(after.value.status) &&
                afterSummary.awaitingToolApproval !== true);
            if (timedOut) {
              await markExecutionFailedFromBackground({
                host,
                executionId,
                organizationId: trustedOrganizationId,
                errorMessage:
                  "Generation timed out before the deliverable was ready. Please try again.",
              });
              return;
            }
            await finalizeDeferredDistributedJob({
              host,
              executionId,
              jobId: ownJobId,
              organizationId: trustedOrganizationId,
              correlationId,
              capabilityId: capabilityIdRaw || "text.generate",
              workingMetadata,
              reqMetadata: req.metadata,
              structuredOutputName:
                req.structuredOutput &&
                typeof req.structuredOutput === "object" &&
                typeof req.structuredOutput.name === "string"
                  ? req.structuredOutput.name
                  : undefined,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            logOsExecutionEvent("execution.background_tick.failed", {
              requestId: correlationId,
              executionId,
              organizationId: trustedOrganizationId,
              status: "failed",
              errorCode: message,
            });
            await markExecutionFailedFromBackground({
              host,
              executionId,
              organizationId: trustedOrganizationId,
              errorMessage:
                message ||
                "Background generation worker failed. Please try again.",
            });
          }
        })();
      } else {
        await host.deps.distributed.tick(1);
      }
      const job = host.deps.distributed.getJob(ownJobId);
      if (job.ok && job.value) {
        const summary = job.value.resultSummary ?? {};
        status = mapJobStatus(job.value.status, summary);
        completedAt = job.value.completedAt;
        errorMessage =
          (typeof summary.errorMessage === "string"
            ? summary.errorMessage
            : undefined) ?? job.value.lastError;
        jobSummary = summary;
        cost = undefined;
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
        recordProviderDispatchFromSummary({
          executionId,
          status,
          jobSummary: summary,
          workingMetadata,
          errorMessage,
        });
      }
      // Deferred long-running: create must stay non-terminal until the background
      // tick finishes — otherwise Phase-6 governance treats queued as provider fail.
      if (
        deferredLongRunning &&
        (status === "queued" || status === "running" || status === "retrying")
      ) {
        status = "queued";
        completedAt = undefined;
        errorMessage = undefined;
      }
    }
  } else if (host.deps.integration) {
    usedSyncDirectPath = true;
    status = "running";
    const capabilityForGateway =
      capabilityIdRaw?.trim() || "text.generate";
    const controlPlaneWorkspaceId = resolveControlPlaneWorkspaceId(req.workspaceId);
    const run = await runDirectProviderExecution({
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
        scenarioHint: undefined,
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
          brandId: executionBrandId,
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
    evaluationScore = undefined;
    errorMessage = awaitingToolApproval
      ? runtime?.error?.message
      : run.value.success
        ? undefined
        : "integration failed";
    const runtimeOutput = (runtime?.response?.output ?? {}) as Readonly<
      Record<string, unknown>
    >;
    runtimeOutputForMedia = runtimeOutput;
    jobSummary = buildIntegrationJobSummary({
      report: run.value,
      executionMode: apiExecutionMode === "live" ? "live" : "simulated",
      durationMs: run.value.durationMs,
    });
    recordProviderDispatchFromSummary({
      executionId,
      status,
      jobSummary: jobSummary as Readonly<Record<string, unknown>>,
      workingMetadata,
      errorMessage,
    });
  } else {
    // Platform-local completion (tests / degraded mode) — still API-mediated.
    status = "succeeded";
    completedAt = now;
    cost = undefined;
    evaluationScore = undefined;
  }

  const resolvedProductMode = resolveProductMode(workingMetadata ?? req.metadata);
  const explicitProductMode = parseProductMode(workingMetadata ?? req.metadata);
  if (
    status === "awaiting_approval" &&
    productModeAutoApprovesTools(explicitProductMode) &&
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
    result = mergeExportArtifactsIntoResult({
      status,
      result,
      jobSummary,
      mediaArtifactIds: summaryArtifactIds,
    });
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

  // Presentation / document structured plans → PPTX + PDF / PDF + DOCX.
  // Prefer worker-side materialization (full runtime still in memory).
  if (status === "succeeded" && jobSummary.documentExportKind == null) {
    const structuredNameHint =
      req.structuredOutput &&
      typeof req.structuredOutput === "object" &&
      typeof req.structuredOutput.name === "string"
        ? req.structuredOutput.name
        : typeof workingMetadata?.structuredOutput === "object" &&
            workingMetadata.structuredOutput &&
            typeof (workingMetadata.structuredOutput as { name?: unknown })
              .name === "string"
          ? String(
              (workingMetadata.structuredOutput as { name: string }).name
            )
          : undefined;
    const outputKindHint =
      typeof workingMetadata?.outputKind === "string"
        ? workingMetadata.outputKind
        : undefined;
    const {
      materializeDocumentExports,
      resolveDocumentExportKind,
      isRequiredDocumentOrPresentationExport,
    } = await import("./document-export-materializer");
    const deliverableRequired = isRequiredDocumentOrPresentationExport({
      outputKind: outputKindHint,
      structuredName: structuredNameHint,
      service:
        typeof workingMetadata?.service === "string"
          ? workingMetadata.service
          : undefined,
      subtype:
        typeof workingMetadata?.subtype === "string"
          ? workingMetadata.subtype
          : undefined,
      deliverableRequired: workingMetadata?.deliverableRequired === true,
    });

    if (!host.deps.asyncMedia && deliverableRequired) {
      status = "failed";
      errorMessage =
        "Document/presentation export requires async media (ENTERPRISE_ASYNC_MEDIA_ENABLED)";
      logOsExecutionEvent("execution.document_export.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "failed",
        errorCode: errorMessage,
      });
    } else if (host.deps.asyncMedia) {
    try {
      let structuredCandidate: unknown =
        (result.kind === "structured" ? result.data : undefined) ??
        jobSummary.structuredData ??
        runtimeOutputForMedia?.structured ??
        runtimeOutputForMedia?.structuredOutput ??
        runtimeOutputForMedia?.data;
      const { recoverPresentationRoutesPayload } = await import(
        "../../os/delivery/document-export-service"
      );
      if (structuredCandidate != null) {
        structuredCandidate = recoverPresentationRoutesPayload(
          structuredCandidate
        );
      }
      const exportKind = resolveDocumentExportKind({
        outputKind: outputKindHint,
        mediaKind:
          typeof workingMetadata?.mediaKind === "string"
            ? workingMetadata.mediaKind
            : undefined,
        structuredName: structuredNameHint,
        data: structuredCandidate,
      });
      if (!exportKind && deliverableRequired) {
        status = "failed";
        errorMessage =
          (structuredNameHint ?? "").toLowerCase().includes("presentation") ||
          (outputKindHint ?? "").toLowerCase() === "presentation"
            ? "Presentation completed without slide decks required for PDF/PPTX export."
            : "Document completed without a valid DocumentPlan required for PDF/DOCX export.";
        logOsExecutionEvent("execution.document_export.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "failed",
          errorCode: errorMessage,
        });
      } else if (exportKind) {
        const exported = await materializeDocumentExports({
          asyncMedia: host.deps.asyncMedia,
          executionId,
          organizationId: trustedOrganizationId,
          exportKind,
          runtimeOutput: runtimeOutputForMedia,
          jobSummary: {
            ...jobSummary,
            ...(structuredCandidate != null
              ? { structuredData: structuredCandidate }
              : {}),
          },
          metadata: workingMetadata,
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
          visualImageDeps:
            host.deps.imageRouter && host.deps.providerRuntimeRegistry
              ? {
                  imageRouter: host.deps.imageRouter,
                  registry: host.deps.providerRuntimeRegistry,
                  createId: host.deps.createId,
                  nowIso: host.deps.nowIso,
                  organizationId: trustedOrganizationId,
                  workspaceId: req.workspaceId,
                  executionId,
                }
              : undefined,
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
              ...(typeof structuredCandidate === "object" &&
              structuredCandidate &&
              !Array.isArray(structuredCandidate)
                ? (structuredCandidate as Record<string, unknown>)
                : {}),
              ...(typeof exported.value.plan === "object" &&
              exported.value.plan
                ? (exported.value.plan as Record<string, unknown>)
                : {}),
              exportKind,
              pdfArtifactId: exported.value.pdfArtifactId,
              ...(exported.value.pptxArtifactId
                ? { pptxArtifactId: exported.value.pptxArtifactId }
                : {}),
              ...(exported.value.docxArtifactId
                ? { docxArtifactId: exported.value.docxArtifactId }
                : {}),
              ...(exported.value.htmlArtifactId
                ? { htmlArtifactId: exported.value.htmlArtifactId }
                : {}),
              downloadFormats:
                exportKind === "email"
                  ? ["html"]
                  : Array.isArray(
                        (exported.value.plan as Record<string, unknown>)
                          ?.downloadFormats,
                      )
                    ? ((exported.value.plan as Record<string, unknown>)
                        .downloadFormats as string[])
                    : exportKind === "document"
                      ? ["pdf", "docx"]
                      : ["pdf", "pptx"],
            },
          };
          logOsExecutionEvent("execution.document_export.materialized", {
            requestId: correlationId,
            executionId,
            organizationId: trustedOrganizationId,
            status: "succeeded",
          });
        } else {
          // Required deliverables always hard-fail; never soft-skip to succeeded.
          status = "failed";
          errorMessage =
            exported.error.message ||
            (exportKind === "document"
              ? "Could not build the document deliverable from the model output."
              : "Could not build the presentation deliverable from the model output.");
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
      if (deliverableRequired) {
        status = "failed";
        errorMessage =
          err instanceof Error
            ? err.message
            : "Document/presentation export failed";
        logOsExecutionEvent("execution.document_export.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "failed",
          errorCode: errorMessage,
        });
      } else {
        logOsExecutionEvent("execution.document_export.skipped", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "skipped",
          errorCode: err instanceof Error ? err.message : String(err),
        });
      }
    }
    }
  }

  // Web Tech → HTML artifact (live preview URL + downloadable source).
  if (status === "succeeded") {
    const websiteRequired =
      (typeof workingMetadata?.service === "string" &&
        workingMetadata.service.toLowerCase() === "website") ||
      (typeof workingMetadata?.outputKind === "string" &&
        /^(deferred_)?website$/i.test(workingMetadata.outputKind)) ||
      (workingMetadata?.structuredOutput &&
        typeof workingMetadata.structuredOutput === "object" &&
        /^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(
          String(
            (workingMetadata.structuredOutput as { name?: unknown }).name ??
              "",
          ),
        ));
    try {
      const exported = await applyWebsiteExportToExecution({
        asyncMedia: host.deps.asyncMedia,
        executionId,
        organizationId: trustedOrganizationId,
        status,
        jobSummary,
        runtimeOutput: runtimeOutputForMedia,
        metadata: workingMetadata,
        createId: host.deps.createId,
        currentResult: result,
        currentArtifactIds: mediaArtifactIds,
        path: "dispatch_sync",
        executionKind: "fresh",
        visualImageDeps:
          host.deps.imageRouter && host.deps.providerRuntimeRegistry
            ? {
                imageRouter: host.deps.imageRouter,
                registry: host.deps.providerRuntimeRegistry,
                createId: host.deps.createId,
                nowIso: host.deps.nowIso,
                organizationId: trustedOrganizationId,
                workspaceId: req.workspaceId,
                executionId,
              }
            : undefined,
      });
      result = exported.result;
      if (exported.artifactIds?.length) {
        mediaArtifactIds = exported.artifactIds;
      }
      if (exported.exported) {
        logOsExecutionEvent("execution.website_export.materialized", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "succeeded",
        });
      } else if (websiteRequired) {
        status = "failed";
        errorMessage =
          exported.errorCode ||
          "Could not build the website deliverable from the model output.";
        jobSummary = {
          ...jobSummary,
          providerJobSucceeded: jobSummary.success === true,
          materializationFailureCode: exported.errorCode,
          websiteMaterializationErrorCode: exported.errorCode,
          websiteMaterializationSettled: true,
        };
        workingMetadata = {
          ...(workingMetadata ?? {}),
          materializationFailureCode: exported.errorCode,
          providerJobSucceeded: jobSummary.providerJobSucceeded === true,
        };
        logOsExecutionEvent("execution.website_export.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "failed",
          errorCode: exported.errorCode ?? errorMessage,
        });
      } else if (exported.errorCode) {
        logOsExecutionEvent("execution.website_export.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "skipped",
          errorCode: exported.errorCode,
        });
      }
      recordWebsiteMaterializationTrace({
        executionId,
        exported: exported.exported,
        websiteRequired: Boolean(websiteRequired),
        artifactIds: mediaArtifactIds,
        errorCode: exported.errorCode,
        finalProviderId: String(
          jobSummary.providerId ??
            jobSummary.routedProviderId ??
            workingMetadata?.preferredProviderId ??
            "unknown",
        ),
        finalModelId: String(
          jobSummary.modelId ??
            jobSummary.routedModelId ??
            workingMetadata?.preferredModelId ??
            "unknown",
        ),
      });
    } catch (err) {
      if (websiteRequired) {
        status = "failed";
        errorMessage =
          err instanceof Error
            ? err.message
            : "Website export failed";
        logOsExecutionEvent("execution.website_export.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "failed",
          errorCode: errorMessage,
        });
      } else {
        logOsExecutionEvent("execution.website_export.skipped", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "skipped",
          errorCode: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Track A Phase A3 — post-guards + ≤1 hard-miss retry on sync direct path only.
  let continuityPostGuardReport: ContinuityPostGuardReport | null = null;
  if (
    usedSyncDirectPath &&
    host.deps.integration &&
    (status === "succeeded" || status === "failed")
  ) {
    const capabilityForGuards = capabilityIdRaw?.trim() || "text.generate";
    const controlPlaneWorkspaceId = resolveControlPlaneWorkspaceId(req.workspaceId);
    const guardMeta = {
      ...(req.metadata ?? {}),
      ...(workingMetadata ?? {}),
    } as Readonly<Record<string, unknown>>;

    continuityPostGuardReport = runContinuityPostGuards({
      organizationId: trustedOrganizationId,
      executionId,
      capabilityId: capabilityForGuards,
      preview: previewFromJobSummary(jobSummary),
      metadata: guardMeta,
      mediaArtifactIds,
      retryCount: 0,
    });

    if (continuityPostGuardReport?.hardRetryRecommended) {
      logOsExecutionEvent("continuity.post_guards.hard_retry", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        capabilityId: capabilityForGuards,
        status: "retrying",
      });
      const retryRun = await runDirectProviderExecution({
        integration: host.deps.integration,
        request: {
          requestId: `${executionId}_guard_retry`,
          rawPrompt: providerPrompt,
          organizationId: asOrganizationId(trustedOrganizationId),
          workspaceId: asWorkspaceId(controlPlaneWorkspaceId),
          budgetLimit: req.budgetLimit,
          tokenBudgetLimit: req.tokenBudgetLimit,
          correlationId,
          mode: CANONICAL_INTEGRATION_MODE,
          scenarioHint: undefined,
          metadata: {
            ...guardMeta,
            ...(req.toolNames ? { toolNames: req.toolNames } : {}),
            ...(req.structuredOutput
              ? { structuredOutput: req.structuredOutput }
              : {}),
            ...(req.capabilityId
              ? {
                  capabilityHint: req.capabilityId,
                  capabilityId: req.capabilityId,
                }
              : {}),
            apiExecutionId: executionId,
            executionId,
            continuityHardGuardRetry: 1,
            userId: principal.userId,
            roles: principal.roles,
            projectId: req.projectId,
            brandId: executionBrandId,
            campaignId:
              typeof req.metadata?.campaignId === "string"
                ? req.metadata.campaignId
                : undefined,
          },
        },
        capabilityId: capabilityForGuards,
        organizationId: trustedOrganizationId,
        workspaceId: controlPlaneWorkspaceId,
        apiExecutionId: executionId,
      });

      if (retryRun.ok) {
        const runtime = retryRun.value.artifacts.runtime;
        const awaitingToolApproval =
          runtime?.error?.code === "TOOL_APPROVAL_REQUIRED";
        approvalRequired = awaitingToolApproval;
        status = awaitingToolApproval
          ? "awaiting_approval"
          : retryRun.value.success
            ? "succeeded"
            : "failed";
        completedAt = awaitingToolApproval ? undefined : host.deps.nowIso();
        errorMessage = awaitingToolApproval
          ? runtime?.error?.message
          : retryRun.value.success
            ? undefined
            : "integration failed after continuity hard-guard retry";
        const runtimeOutput = (runtime?.response?.output ?? {}) as Readonly<
          Record<string, unknown>
        >;
        runtimeOutputForMedia = runtimeOutput;
        jobSummary = buildIntegrationJobSummary({
          report: retryRun.value,
          executionMode: apiExecutionMode === "live" ? "live" : "simulated",
          durationMs: retryRun.value.durationMs,
        });
        result = buildExecutionResultPayload({
          status,
          jobSummary,
          runtimeOutput: runtimeOutputForMedia,
        });

        // Re-materialize sync images after hard retry when possible.
        if (
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
          }
        }

        continuityPostGuardReport = runContinuityPostGuards({
          organizationId: trustedOrganizationId,
          executionId,
          capabilityId: capabilityForGuards,
          preview: previewFromJobSummary(jobSummary),
          metadata: guardMeta,
          mediaArtifactIds,
          retryCount: 1,
        });
      }
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
    ...(executionBrandId ? { brandId: executionBrandId } : {}),
    ...conversationFieldsFromMetadata(req.metadata),
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
  const stillInFlight =
    deferredLongRunning &&
    (status === "queued" || status === "running" || status === "retrying");
  const providerSucceeded =
    status === "succeeded" || status === "awaiting_approval";
  const continuityGuardCtx = extractContinuityGuardContext({
    ...(req.metadata ?? {}),
    ...(workingMetadata ?? {}),
  });
  // Never run Phase-6 REJECT while the deferred job is still queued/running —
  // that falsely marks long website/deck/doc creates as provider failures.
  const phase6Governance = stillInFlight
    ? {
        governance: defaultGovernanceEngine.decide({
          evaluationScore: null,
          evaluationPlaceholder: true,
          humanReviewFlag: false,
          providerSuccess: true,
          nowIso: host.deps.nowIso,
        }),
        evaluation: {
          executionId,
          score: null,
          humanReviewRequired: false,
        } as ExecutionEvaluationSummary,
        humanReview: undefined,
        creativeQaExtras: undefined,
      }
    : finalizeExecutionGovernanceExtras({
        governanceFinalize: host.governanceFinalize,
        organizationId: trustedOrganizationId,
        executionId,
        capabilityId: capabilityIdRaw || "text.generate",
        objective: req.prompt.slice(0, 500),
        preview: previewFromJobSummary(jobSummary),
        brandTone: continuityGuardCtx.brandTone,
        brandVoice: continuityGuardCtx.brandVoice,
        brandAvoidTerms: continuityGuardCtx.brandAvoidTerms,
        continuityBound: continuityGuardCtx.continuityBound,
        boundLogoAssetId: continuityGuardCtx.boundLogoAssetId,
        mediaOutputCount: mediaArtifactIds?.length ?? 0,
        isImageCapability: isImageGenerationCapability(capabilityIdRaw),
        service:
          typeof workingMetadata?.service === "string"
            ? workingMetadata.service
            : undefined,
        territory:
          typeof workingMetadata?.routeTerritory === "string"
            ? workingMetadata.routeTerritory
            : undefined,
        planId: undefined,
        planVersion: undefined,
        providerSuccess: providerSucceeded,
        fallbackEvaluationScore: evaluationScore ?? null,
        productMode: resolvedProductMode,
        outputKind:
          typeof workingMetadata?.outputKind === "string"
            ? workingMetadata.outputKind
            : undefined,
        structuredOutputName:
          req.structuredOutput &&
          typeof req.structuredOutput === "object" &&
          typeof req.structuredOutput.name === "string"
            ? req.structuredOutput.name
            : typeof workingMetadata?.structuredOutput === "object" &&
                workingMetadata.structuredOutput &&
                typeof (workingMetadata.structuredOutput as { name?: unknown })
                  .name === "string"
              ? String(
                  (workingMetadata.structuredOutput as { name: string }).name
                )
              : undefined,
        ...validationContextFromExecution({
          metadata: workingMetadata,
          jobSummary,
          mediaArtifactIds,
        }),
        nowIso: host.deps.nowIso,
        createId: host.deps.createId,
      });
  const postGuardExtras = continuityPostGuardExtras(continuityPostGuardReport);
  const continuitySnapExtras = continuitySnapshotForExtras({
    ...(req.metadata ?? {}),
    ...(workingMetadata ?? {}),
    preferredProviderId:
      workingMetadata?.preferredProviderId ?? req.providerId,
    preferredModelId: workingMetadata?.preferredModelId ?? req.modelId,
    capabilityId: capabilityIdRaw || req.capabilityId,
  });
  const packExtras =
    workingMetadata?.packPlan && typeof workingMetadata.packPlan === "object"
      ? { packPlan: workingMetadata.packPlan, continuityPack: true }
      : workingMetadata?.packPlanShadow
        ? { packPlanShadow: workingMetadata.packPlanShadow }
        : undefined;
  const continuityObs = buildContinuityObservabilitySummary({
    metadata: {
      ...(req.metadata ?? {}),
      ...(workingMetadata ?? {}),
    },
    extras: {
      ...(continuitySnapExtras ?? {}),
      ...(postGuardExtras ?? {}),
    },
  });
  const continuityObsExtras = {
    continuityObservability: continuityObs,
  };

  const workflowFromMeta = workingMetadata?.serviceContextWorkflow as
    | ServiceContextWorkflow
    | undefined;
  const workflowFollowUp = workflowFromMeta
    ? buildWorkflowFollowUpFromMetadata({
        executionId,
        prompt: req.prompt,
        workflow: workflowFromMeta,
        brandId: executionBrandId,
        nowIso: host.deps.nowIso,
      })
    : undefined;

  let autoDelivery: { deliveryId?: string; error?: string } | undefined;
  const releaseBlocked =
    phase6Governance.evaluation.releaseBlocked === true ||
    phase6Governance.governance.blocking === true;

  // Phase 6 — stamp measured (+ optional vision) Field Guide evidence before delivery.
  if (
    status === "succeeded" &&
    isImageGenerationCapability(capabilityIdRaw) &&
    runtimeOutputForMedia
  ) {
    try {
      const vfg = await applyVisualFieldGuideEvidenceAfterImage({
        metadata: workingMetadata,
        runtimeOutput: runtimeOutputForMedia,
        executionId,
        organizationId: trustedOrganizationId,
      });
      workingMetadata = vfg.metadata;
      state.workingMetadata = vfg.metadata;
    } catch (err) {
      logOsExecutionEvent("execution.visual_field_guide_evidence.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "warning",
        errorCode:
          err instanceof Error ? err.message.slice(0, 120) : "vfg_stamp_failed",
      });
    }
  }

  if (status === "succeeded" && artifactRefs.length > 0 && !releaseBlocked) {
    autoDelivery = await maybeAutoDeliverOnSuccess({
      deliveryService: host.deliveryService,
      organizationId: trustedOrganizationId,
      executionId,
      artifactRefs,
      nowIso: host.deps.nowIso,
      createId: host.deps.createId,
      metadata: workingMetadata,
    });
  } else if (status === "succeeded" && releaseBlocked) {
    autoDelivery = {
      error:
        phase6Governance.evaluation.creativeScore != null
          ? `Release blocked — creative score ${phase6Governance.evaluation.creativeScore}/100 (gate 80)`
          : "Release blocked — creative QA gate failed",
    };
  }

  const derivedCost = await deriveFinalizeExecutionCost(executionId);

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
    cost: derivedCost,
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
    ...(postGuardExtras ?? {}),
    ...(continuitySnapExtras ?? {}),
    ...(packExtras ?? {}),
    ...continuityObsExtras,
    ...(phase6Governance.creativeQaExtras ?? {}),
    ...(readExecutionSpecSnapshot(workingMetadata)
      ? { executionSpecSnapshot: readExecutionSpecSnapshot(workingMetadata) }
      : {}),
    createMetadataSnapshot: pickRetryableCreateMetadata(workingMetadata),
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

  if (!stillInFlight) {
    hookProductionEvidenceAfterFinalize({
      organizationId: trustedOrganizationId,
      executionId,
      requestId: correlationId,
      capabilityId: capabilityIdRaw || "text.generate",
      providerId: String(
        jobSummary.actualProviderId ??
          jobSummary.providerId ??
          jobSummary.provider ??
          jobSummary.routedProviderId ??
          workingMetadata?.preferredProviderId ??
          req.providerId ??
          "provider.unknown",
      ),
      modelId: String(
        jobSummary.actualModelId ??
          jobSummary.modelId ??
          jobSummary.model ??
          jobSummary.routedModelId ??
          workingMetadata?.preferredModelId ??
          req.modelId ??
          "unknown",
      ),
      service:
        typeof workingMetadata?.service === "string"
          ? workingMetadata.service
          : undefined,
      subtype:
        typeof workingMetadata?.subtype === "string"
          ? workingMetadata.subtype
          : undefined,
      outputKind:
        typeof workingMetadata?.outputKind === "string"
          ? workingMetadata.outputKind
          : undefined,
      industry:
        typeof workingMetadata?.industry === "string"
          ? workingMetadata.industry
          : undefined,
      platform:
        typeof workingMetadata?.platform === "string"
          ? workingMetadata.platform
          : undefined,
      format:
        typeof workingMetadata?.format === "string"
          ? workingMetadata.format
          : undefined,
      preview: previewFromJobSummary(jobSummary),
      briefObjective: resolveBriefObjectiveFromMetadata(workingMetadata, req.prompt),
      structuredData: jobSummary.structuredData,
      mediaArtifactIds,
      executionSpecSnapshot:
        state.executionSpecSnapshot ?? readExecutionSpecSnapshot(workingMetadata),
      presentDeliverableFormats: resolveProductionComplianceFormats({
        metadata: workingMetadata,
        structuredData: jobSummary.structuredData,
        preview: previewFromJobSummary(jobSummary),
      }),
      generatedQuantity:
        typeof jobSummary.routeCount === "number"
          ? jobSummary.routeCount
          : typeof workingMetadata?.executionSpecQuantity === "number"
            ? workingMetadata.executionSpecQuantity
            : undefined,
      providerSuccess:
        workingMetadata?.providerJobSucceeded === true ||
        providerSucceeded,
      latencyMs: Number(jobSummary.durationMs ?? jobSummary.latencyMs ?? 0),
      inputTokens:
        Number(jobSummary.inputTokens ?? jobSummary.promptTokens ?? 0) || undefined,
      outputTokens:
        Number(jobSummary.outputTokens ?? jobSummary.completionTokens ?? 0) || undefined,
      totalTokens: tokensUsed > 0 ? tokensUsed : undefined,
      estimatedCost: cost ?? null,
      metadata: workingMetadata,
      artifactEvaluationDeps: resolveProductionArtifactEvaluationDeps(host),
      fallbackUsed: jobSummary.fallbackUsed === true,
      fallbackReason:
        typeof jobSummary.fallbackReason === "string"
          ? jobSummary.fallbackReason
          : undefined,
      createId: host.deps.createId,
      nowIso: host.deps.nowIso,
    });
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

function isTerminalJobStatus(status: string): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "dead_letter"
  );
}

function resolveProductionArtifactEvaluationDeps(
  host: ExecutionCreateHost,
): { readonly asyncMedia: NonNullable<ExecutionCreateHost["deps"]["asyncMedia"]>; readonly artifactsRepo: NonNullable<NonNullable<ExecutionCreateHost["deps"]["persistence"]>["artifacts"]> } | undefined {
  const asyncMedia = host.deps.asyncMedia;
  const artifactsRepo = host.deps.persistence?.artifacts;
  if (!asyncMedia || !artifactsRepo) return undefined;
  return Object.freeze({ asyncMedia, artifactsRepo });
}

function jobMediaArtifactIds(
  summary: Readonly<Record<string, unknown>>
): string[] {
  return Array.isArray(summary.mediaArtifactIds)
    ? summary.mediaArtifactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
}

/**
 * After a deferred background tick, copy terminal job state onto the execution
 * and run real Phase-6 governance (create returned with a placeholder).
 */
async function finalizeDeferredDistributedJob(input: {
  host: ExecutionCreateHost;
  executionId: string;
  jobId: JobId;
  organizationId: string;
  correlationId: string;
  capabilityId: string;
  workingMetadata: Record<string, unknown> | undefined;
  reqMetadata: Readonly<Record<string, unknown>> | undefined;
  structuredOutputName?: string;
}): Promise<void> {
  const {
    host,
    executionId,
    jobId,
    organizationId,
    correlationId,
    capabilityId,
    workingMetadata,
    reqMetadata,
    structuredOutputName,
  } = input;
  if (!host.deps.distributed) return;

  const existing = await host.loadExecution(executionId);
  if (!existing) return;
  if (
    existing.status === "succeeded" ||
    existing.status === "failed" ||
    existing.status === "cancelled"
  ) {
    return;
  }

  const job = host.deps.distributed.getJob(asJobId(String(jobId)));
  if (!job.ok || !job.value) return;

  const summary = job.value.resultSummary ?? {};
  const awaitingToolApproval = summary.awaitingToolApproval === true;
  if (!isTerminalJobStatus(job.value.status) && !awaitingToolApproval) {
    logOsExecutionEvent("execution.background_tick.partial", {
      requestId: correlationId,
      executionId,
      organizationId,
      status: mapJobStatus(job.value.status, summary),
      errorCode: String(job.value.status),
    });
    return;
  }

  let status = mapJobStatus(job.value.status, summary);
  const mediaArtifactIds = jobMediaArtifactIds(summary);
  let nextResult = mergeExportArtifactsIntoResult({
    status,
    result: buildExecutionResultPayload({
      status,
      jobSummary: summary,
    }),
    jobSummary: summary,
    mediaArtifactIds,
  });
  let nextError =
    (typeof summary.errorMessage === "string"
      ? summary.errorMessage
      : undefined) ?? job.value.lastError;

  if (awaitingToolApproval) {
    status = "awaiting_approval";
    nextError =
      typeof summary.errorMessage === "string"
        ? summary.errorMessage
        : "tool approval required";
  } else if (summary.success === false) {
    status = "failed";
    nextError =
      typeof summary.errorMessage === "string"
        ? summary.errorMessage
        : "integration context resolution failed";
  }

  recordProviderDispatchFromSummary({
    executionId,
    status,
    jobSummary: summary,
    workingMetadata,
    errorMessage: nextError,
  });

  const meta = {
    ...(reqMetadata ?? {}),
    ...(workingMetadata ?? {}),
    ...(job.value.payload?.metadata ?? {}),
  } as Record<string, unknown>;

  const exported = await applyWebsiteExportToExecution({
    asyncMedia: host.deps.asyncMedia,
    executionId,
    organizationId,
    status,
    jobSummary: summary,
    metadata: meta,
    createId: host.deps.createId,
    currentResult: nextResult,
    currentArtifactIds:
      mediaArtifactIds.length > 0
        ? mediaArtifactIds
        : existing.artifactIds,
    path: "dispatch_finalize",
    executionKind: "recovered_job",
    visualImageDeps:
      host.deps.imageRouter && host.deps.providerRuntimeRegistry
        ? {
            imageRouter: host.deps.imageRouter,
            registry: host.deps.providerRuntimeRegistry,
            createId: host.deps.createId,
            nowIso: host.deps.nowIso,
            organizationId,
            executionId,
          }
        : undefined,
  });
  nextResult = exported.result;
  const nextArtifactIds = exported.artifactIds ?? existing.artifactIds;

  if (
    exported.errorCode &&
    !exported.exported &&
    status === "succeeded"
  ) {
    const websiteRequired =
      (typeof meta.service === "string" &&
        meta.service.toLowerCase() === "website") ||
      (typeof meta.outputKind === "string" &&
        /^(deferred_)?website$/i.test(meta.outputKind)) ||
      (meta.structuredOutput &&
        typeof meta.structuredOutput === "object" &&
        /^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(
          String(
            (meta.structuredOutput as { name?: unknown }).name ?? ""
          )
        ));
    if (websiteRequired) {
      status = "failed";
      nextError =
        exported.errorCode ||
        "Could not build the website deliverable from the model output.";
    }
  }

  const deferredWebsiteRequired =
    (typeof meta.service === "string" && meta.service.toLowerCase() === "website") ||
    (typeof meta.outputKind === "string" &&
      /^(deferred_)?website$/i.test(meta.outputKind)) ||
    (meta.structuredOutput &&
      typeof meta.structuredOutput === "object" &&
      /^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(
        String((meta.structuredOutput as { name?: unknown }).name ?? ""),
      ));
  recordWebsiteMaterializationTrace({
    executionId,
    exported: exported.exported,
    websiteRequired: deferredWebsiteRequired,
    artifactIds: nextArtifactIds,
    errorCode: exported.errorCode,
    finalProviderId: String(
      summary.providerId ??
        summary.routedProviderId ??
        meta.preferredProviderId ??
        "unknown",
    ),
    finalModelId: String(
      summary.modelId ??
        summary.routedModelId ??
        meta.preferredModelId ??
        "unknown",
    ),
  });

  const evaluationScore =
    typeof summary.evaluationScore === "number" &&
    Number.isFinite(summary.evaluationScore)
      ? Number(summary.evaluationScore)
      : typeof summary.qualityScore === "number" &&
          Number.isFinite(summary.qualityScore)
        ? Number(summary.qualityScore)
        : existing.evaluationScore;

  const updated: ExecutionResource = {
    ...existing,
    status,
    completedAt:
      status === "awaiting_approval"
        ? undefined
        : (job.value.completedAt ?? host.deps.nowIso()),
    errorMessage: nextError,
    artifactIds: nextArtifactIds,
    result: nextResult,
    cost: Number(summary.cost ?? existing.cost ?? 0) || existing.cost,
    evaluationScore,
    updatedAt: host.deps.nowIso(),
  };
  host.executionStore.set(executionId, updated);
  if (host.deps.persistence) {
    await host.deps.persistence.executions.update(updated);
  }

  const continuityGuardCtx = extractContinuityGuardContext(meta);
  const providerSucceeded =
    status === "succeeded" || status === "awaiting_approval";
  const phase6 = finalizeExecutionGovernanceExtras({
    governanceFinalize: host.governanceFinalize,
    organizationId,
    executionId,
    capabilityId,
    objective:
      typeof existing.promptPreview === "string"
        ? existing.promptPreview.slice(0, 500)
        : "",
    preview: previewFromJobSummary(summary),
    brandTone: continuityGuardCtx.brandTone,
    brandVoice: continuityGuardCtx.brandVoice,
    brandAvoidTerms: continuityGuardCtx.brandAvoidTerms,
    continuityBound: continuityGuardCtx.continuityBound,
    boundLogoAssetId: continuityGuardCtx.boundLogoAssetId,
    mediaOutputCount: mediaArtifactIds.length,
    isImageCapability: isImageGenerationCapability(capabilityId),
    service: typeof meta.service === "string" ? meta.service : undefined,
    territory:
      typeof meta.routeTerritory === "string"
        ? meta.routeTerritory
        : undefined,
    planId: undefined,
    planVersion: undefined,
    providerSuccess: providerSucceeded,
    fallbackEvaluationScore: evaluationScore ?? null,
    productMode: resolveProductMode(meta),
    outputKind:
      typeof meta.outputKind === "string" ? meta.outputKind : undefined,
    structuredOutputName:
      structuredOutputName ??
      (typeof meta.structuredOutput === "object" &&
      meta.structuredOutput &&
      typeof (meta.structuredOutput as { name?: unknown }).name === "string"
        ? String((meta.structuredOutput as { name: string }).name)
        : undefined),
    ...validationContextFromExecution({
      metadata: meta,
      jobSummary: summary,
      mediaArtifactIds,
    }),
    nowIso: host.deps.nowIso,
    createId: host.deps.createId,
  });

  const prevExtras = host.extrasStore.get(executionId);
  const deferredContinuationMeta = pickRetryableCreateMetadata(meta);
  const extras: ExecutionExtrasRecord = {
    diagnostics: diagnosticsFromJobSummary(
      executionId,
      nextError,
      {
        ...summary,
        executionMode:
          summary.executionMode ?? host.deps.executionMode ?? "stub",
        providerMode:
          summary.providerMode ??
          ((host.deps.executionMode ?? "stub") === "stub"
            ? "stub"
            : "simulated"),
      },
      host.deps.nowIso(),
      String(jobId),
      status
    ),
    trace: prevExtras?.trace ?? {
      executionId,
      correlationId,
      stages: ["gateway", "queue", "worker", "integration", "background_finalize"],
      durationMs: 0,
    },
    cost: prevExtras?.cost ?? {
      executionId,
      amount: updated.cost ?? null,
      currency: updated.cost != null ? "USD" : null,
      status: updated.cost != null ? "calculated" : "unknown",
    },
    evaluation: phase6.evaluation,
    experience: experienceSummaryFromJobSummary(executionId, summary),
    osLifecycle: osLifecycleFromApiStatus(status),
    governance: phase6.governance,
    ...(prevExtras?.asyncLane ? { asyncLane: prevExtras.asyncLane } : {}),
    ...(prevExtras?.workflowFollowUp
      ? { workflowFollowUp: prevExtras.workflowFollowUp }
      : {}),
    ...(prevExtras?.continuitySnapshot
      ? { continuitySnapshot: prevExtras.continuitySnapshot }
      : {}),
    ...(prevExtras?.continuityPostGuards
      ? { continuityPostGuards: prevExtras.continuityPostGuards }
      : {}),
    ...(prevExtras?.packPlan ? { packPlan: prevExtras.packPlan } : {}),
    ...(prevExtras?.packPlanShadow
      ? { packPlanShadow: prevExtras.packPlanShadow }
      : {}),
    ...(prevExtras?.continuityPack
      ? { continuityPack: prevExtras.continuityPack }
      : {}),
    ...(prevExtras?.continuityObservability
      ? { continuityObservability: prevExtras.continuityObservability }
      : {}),
    ...(phase6.humanReview
      ? {
          pendingHumanReview: {
            reviewId: phase6.humanReview.reviewId,
            reason: phase6.humanReview.reason,
            requestedAt: phase6.humanReview.requestedAt,
          },
        }
      : {}),
    ...(phase6.creativeQaExtras ?? {}),
    ...(readExecutionSpecSnapshot(meta)
      ? { executionSpecSnapshot: readExecutionSpecSnapshot(meta) }
      : prevExtras?.executionSpecSnapshot
        ? { executionSpecSnapshot: prevExtras.executionSpecSnapshot }
        : {}),
    ...(Object.keys(deferredContinuationMeta).length > 0
      ? { createMetadataSnapshot: deferredContinuationMeta }
      : prevExtras?.createMetadataSnapshot
        ? { createMetadataSnapshot: prevExtras.createMetadataSnapshot }
        : {}),
  };
  host.extrasStore.set(executionId, extras);
  if (host.deps.persistence) {
    await host.deps.persistence.extras.save(
      executionId,
      organizationId,
      extras
    );
  }

  hookProductionEvidenceAfterFinalize({
    organizationId,
    executionId,
    requestId: correlationId,
    capabilityId,
    providerId: String(
      summary.actualProviderId ??
        summary.providerId ??
        summary.provider ??
        summary.routedProviderId ??
        meta.preferredProviderId ??
        "provider.unknown",
    ),
    modelId: String(
      summary.actualModelId ??
        summary.modelId ??
        summary.model ??
        summary.routedModelId ??
        meta.preferredModelId ??
        "unknown",
    ),
    service: typeof meta.service === "string" ? meta.service : undefined,
    subtype: typeof meta.subtype === "string" ? meta.subtype : undefined,
    outputKind: typeof meta.outputKind === "string" ? meta.outputKind : undefined,
    industry: typeof meta.industry === "string" ? meta.industry : undefined,
    platform: typeof meta.platform === "string" ? meta.platform : undefined,
    format: typeof meta.format === "string" ? meta.format : undefined,
    preview: previewFromJobSummary(summary),
    briefObjective: resolveBriefObjectiveFromMetadata(
      meta,
      typeof existing.promptPreview === "string" ? existing.promptPreview : undefined,
    ),
    structuredData: summary.structuredData,
    mediaArtifactIds,
    executionSpecSnapshot: readExecutionSpecSnapshot(meta),
    presentDeliverableFormats: resolveProductionComplianceFormats({
      metadata: meta,
      structuredData: summary.structuredData,
      preview: previewFromJobSummary(summary),
    }),
    generatedQuantity:
      typeof summary.routeCount === "number"
        ? summary.routeCount
        : typeof meta.executionSpecQuantity === "number"
          ? meta.executionSpecQuantity
          : undefined,
    providerSuccess: providerSucceeded,
    latencyMs: Number(summary.durationMs ?? summary.latencyMs ?? 0),
    estimatedCost: updated.cost ?? null,
    metadata: meta,
    artifactEvaluationDeps: resolveProductionArtifactEvaluationDeps(host),
    fallbackUsed: summary.fallbackUsed === true,
    fallbackReason:
      typeof summary.fallbackReason === "string" ? summary.fallbackReason : undefined,
    createId: host.deps.createId,
    nowIso: host.deps.nowIso,
  });

  logOsExecutionEvent("execution.background_finalize", {
    requestId: correlationId,
    executionId,
    organizationId,
    capabilityId,
    status,
    lifecycle: extras.osLifecycle,
    errorCode: nextError ? "execution_failed" : undefined,
  });

  if (host.deps.streaming) {
    const sub = host.deps.streaming.subscribe(executionId, "sse");
    if (sub.ok) {
      host.deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId,
        kind: "status",
        payload: { status },
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
}

async function markExecutionFailedFromBackground(input: {
  host: ExecutionCreateHost;
  executionId: string;
  organizationId: string;
  errorMessage: string;
}): Promise<void> {
  const { host, executionId, organizationId, errorMessage } = input;
  const existing = await host.loadExecution(executionId);
  if (!existing) return;
  if (
    existing.status === "succeeded" ||
    existing.status === "failed" ||
    existing.status === "cancelled"
  ) {
    return;
  }

  const updated: ExecutionResource = {
    ...existing,
    status: "failed",
    errorMessage,
    completedAt: host.deps.nowIso(),
    updatedAt: host.deps.nowIso(),
  };
  host.executionStore.set(executionId, updated);
  if (host.deps.persistence) {
    await host.deps.persistence.executions.update(updated);
  }

  const prevExtras = host.extrasStore.get(executionId);
  const governance = defaultGovernanceEngine.decide({
    evaluationScore: null,
    evaluationPlaceholder: false,
    humanReviewFlag: false,
    providerSuccess: false,
    nowIso: host.deps.nowIso,
  });
  const extras: ExecutionExtrasRecord = {
    diagnostics: prevExtras?.diagnostics ?? {
      executionId,
      stages: [{ stage: "background_tick", status: "failed" }],
      generatedAt: host.deps.nowIso(),
      rootCause: errorMessage,
    },
    trace: prevExtras?.trace ?? {
      executionId,
      correlationId: existing.correlationId,
      stages: ["gateway", "queue", "background_tick"],
      durationMs: 0,
    },
    cost: prevExtras?.cost ?? {
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
    experience: prevExtras?.experience ?? {
      executionId,
      experienceIds: [],
      applied: false,
    },
    osLifecycle: osLifecycleFromApiStatus("failed"),
    governance,
    ...(prevExtras?.asyncLane ? { asyncLane: prevExtras.asyncLane } : {}),
    ...(prevExtras?.workflowFollowUp
      ? { workflowFollowUp: prevExtras.workflowFollowUp }
      : {}),
    ...(prevExtras?.continuitySnapshot
      ? { continuitySnapshot: prevExtras.continuitySnapshot }
      : {}),
    ...(prevExtras?.continuityObservability
      ? { continuityObservability: prevExtras.continuityObservability }
      : {}),
  };
  host.extrasStore.set(executionId, extras);
  if (host.deps.persistence) {
    await host.deps.persistence.extras.save(
      executionId,
      organizationId,
      extras
    );
  }

  if (host.deps.streaming) {
    const sub = host.deps.streaming.subscribe(executionId, "sse");
    if (sub.ok) {
      host.deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId,
        kind: "status",
        payload: { status: "failed" },
      });
      host.deps.streaming.push({
        subscriptionId: sub.value.subscriptionId,
        executionId,
        kind: "done",
        payload: { status: "failed" },
      });
    }
  }
}
