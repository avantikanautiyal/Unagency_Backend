/**
 * Canonical streaming path — OS ingress already applied via handoff.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { CreateExecutionRequest, ExecutionResource } from "../contracts";
import { logOsExecutionEvent } from "../../os";
import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { StreamingExecutionResult } from "../../intelligence/providers/streaming/orchestrator/streaming-execution-orchestrator";
import {
  CANONICAL_STREAM_PLANNING_MODE,
  type CanonicalStreamHandoff,
  buildCanonicalIntegrationRequest,
  extractCanonicalRouting,
  runCanonicalIntegration,
} from "./canonical-execution-spine";
import {
  buildIntegrationPlanningSnapshot,
  buildProviderRuntimeFromStreamResult,
  runDeferredIntegrationPostProcessing,
} from "../../intelligence/integration/adapters/deferred-post-processing";
import { mergePostProcessingIntoExtras } from "./integration-post-processing-extras";
import {
  startEnterpriseSimulatedStream,
  type LiveSseExecutionPayload,
} from "./execution-streaming-service";
import type { ExecutionCreateHost } from "./execution-create-host";

export async function executeCanonicalStream(
  host: ExecutionCreateHost,
  handoff: CanonicalStreamHandoff,
  abortSignal?: AbortSignal
): Promise<Result<LiveSseExecutionPayload>> {
  const { req, executionId, correlationId, trustedOrganizationId, providerPrompt } =
    handoff;
  const orgId = trustedOrganizationId;

  let chosenProviderId =
    req.providerId?.trim() ||
    (typeof handoff.workingMetadata?.preferredProviderId === "string"
      ? handoff.workingMetadata.preferredProviderId
      : undefined);
  let chosenModelId =
    req.modelId?.trim() ||
    (typeof handoff.workingMetadata?.preferredModelId === "string"
      ? handoff.workingMetadata.preferredModelId
      : undefined);

  let streamPrompt = providerPrompt;
  let planningReport: IntelligenceOsIntegrationReport | undefined;

  // Integration pipeline stages 1–10 — optimize before provider stream.
  if (host.deps.integration) {
    const planning = await runCanonicalIntegration(host.deps.integration, {
      executionId,
      correlationId,
      trustedOrganizationId,
      providerPrompt,
      req,
      workingMetadata: handoff.workingMetadata,
      structuredBrief: handoff.structuredBrief,
      principal: handoff.principal,
      mode: CANONICAL_STREAM_PLANNING_MODE,
    });
    if (!planning.ok) {
      return failure(planning.error);
    }
    planningReport = planning.value;
    const routing = extractCanonicalRouting(planning.value, {
      providerId: chosenProviderId,
      modelId: chosenModelId,
    });
    chosenProviderId = routing.providerId;
    chosenModelId = routing.modelId;
    logOsExecutionEvent("execution.stream.planned", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId: req.capabilityId,
      providerId: chosenProviderId,
      modelId: chosenModelId,
      status: `streaming:${chosenProviderId}/${chosenModelId}`,
    });
  }

  const liveMode = host.deps.executionMode === "live";
  const { composeNativeStreamingDispatchers } = await import(
    "../../intelligence/providers/streaming/composition/compose-native-streaming-dispatchers"
  );
  const dispatchers =
    host.deps.nativeStreamDispatchers && host.deps.nativeStreamDispatchers.size > 0
      ? host.deps.nativeStreamDispatchers
      : composeNativeStreamingDispatchers();

  const dispatcher =
    chosenProviderId && dispatchers.has(chosenProviderId)
      ? dispatchers.get(chosenProviderId)
      : undefined;

  if (!liveMode || !dispatcher) {
    const enrichedReq: CreateExecutionRequest = {
      ...req,
      prompt: streamPrompt,
      providerId: chosenProviderId,
      modelId: chosenModelId,
      metadata: {
        ...(handoff.workingMetadata ?? {}),
        enrichedPrompt: streamPrompt,
        canonicalPipeline: true,
      },
    };
    return startEnterpriseSimulatedStream({
      req: enrichedReq,
      principal: {
        ...handoff.principal,
        organizationId: orgId,
      },
      tenant: { organizationId: orgId, workspaceId: req.workspaceId },
      abortSignal,
      deps: {
        nowIso: host.deps.nowIso,
        createId: host.deps.createId,
        sleep: async () => undefined,
        saveExecution: async (resource) => {
          host.executionStore.set(resource.executionId, resource);
          if (host.deps.persistence) {
            const existing = await host.deps.persistence.executions.get(
              resource.executionId
            );
            if (existing) {
              await host.deps.persistence.executions.update(resource);
            } else {
              await host.deps.persistence.executions.save(resource);
            }
          }
          if (
            planningReport &&
            (resource.status === "succeeded" || resource.status === "failed")
          ) {
            await applyDeferredStreamPostProcessing(host, {
              handoff,
              planningReport,
              providerId: chosenProviderId ?? "provider.stream_sim",
              modelId: chosenModelId ?? "model.stream_sim",
              terminalStatus: resource.status,
              streamResult: {
                executionId: resource.executionId,
                success: resource.status === "succeeded",
                terminationReason:
                  resource.status === "succeeded" ? "completed" : "provider_failed",
                streamCommitted: resource.status === "succeeded",
                preCommitFailovers: 0,
                attempts: [],
                finalContent:
                  resource.result?.kind === "text" ? resource.result.text ?? "" : "",
                finalReasoning: "",
                usageStatus: "unknown",
                usage: {},
                cost: null,
                toolCalls: [],
                partial: false,
                totalStreamDurationMs: 0,
                eventCount: 0,
                events: [],
              },
            });
          }
        },
      },
    });
  }

  const { StreamingExecutionOrchestrator, providerStreamEventToSse } = await import(
    "../../intelligence/providers/streaming"
  );
  const { CancellationSource } = await import(
    "../../intelligence/providers/runtime/cancellation/cancellation-engine"
  );
  const { asCapabilityId, asOrganizationId, asProviderId } = await import(
    "../../intelligence/shared/identifiers"
  );

  const now = host.deps.nowIso();
  const resource: ExecutionResource = {
    executionId,
    status: "streaming",
    organizationId: orgId,
    workspaceId: req.workspaceId,
    capabilityId: req.capabilityId ?? handoff.capabilityIdRaw ?? "text.generate",
    correlationId,
    createdAt: now,
    updatedAt: now,
    promptPreview: req.prompt.slice(0, 120),
    result: { kind: "pending" },
  };
  host.executionStore.set(executionId, resource);
  if (host.deps.persistence) {
    await host.deps.persistence.executions.update(resource);
  }

  const cancel = new CancellationSource();
  const liveToken = {
    get cancelled() {
      return cancel.token.cancelled;
    },
    get reason() {
      return cancel.token.reason;
    },
  };
  if (abortSignal) {
    const onAbort = () => cancel.cancel("client_disconnected");
    if (abortSignal.aborted) onAbort();
    else abortSignal.addEventListener("abort", onAbort, { once: true });
  }

  const frameQueue: import("../contracts").SseFrame[] = [];
  let resolveWait: (() => void) | null = null;
  let closed = false;

  const pushFrame = (frame: import("../contracts").SseFrame) => {
    frameQueue.push(frame);
    resolveWait?.();
    resolveWait = null;
  };

  const frameIterable: AsyncIterable<import("../contracts").SseFrame> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (frameQueue.length === 0 && !closed) {
            await new Promise<void>((r) => {
              resolveWait = r;
            });
          }
          if (frameQueue.length > 0) {
            return { value: frameQueue.shift()!, done: false };
          }
          return {
            value: undefined as unknown as import("../contracts").SseFrame,
            done: true,
          };
        },
      };
    },
  };

  const providerRequest = {
    requestId: `${executionId}_stream`,
    context: {
      executionId: executionId as never,
      organizationId: asOrganizationId(orgId),
      correlationId,
    } as never,
    capabilityId: asCapabilityId(req.capabilityId ?? "text.generate"),
    providerId: asProviderId(chosenProviderId!),
    modelId: chosenModelId ?? "gpt-4o",
    payload: {
      prompt: streamPrompt,
      ...(handoff.workingMetadata ?? {}),
    },
    retryPolicy: { strategy: "none" as const, maxAttempts: 1, baseDelayMs: 0 },
    timeoutPolicy: { executionTimeoutMs: 120_000 },
    streaming: true as const,
    priority: 0,
    createdAt: now,
  };

  void (async () => {
    try {
      const orch = new StreamingExecutionOrchestrator({
        nowIso: host.deps.nowIso,
        sleep: async () => undefined,
        createId: host.deps.createId,
        onEvent: async (event) => {
          if (
            event.type === "reasoning.delta" ||
            event.type === "tool_call.arguments.delta"
          ) {
            return;
          }
          const frame = providerStreamEventToSse(event);
          try {
            const data = JSON.parse(frame.data) as Record<string, unknown>;
            delete data.providerId;
            delete data.modelId;
            pushFrame({
              event: frame.event,
              id: frame.id,
              data: JSON.stringify(data),
            });
          } catch {
            pushFrame(frame);
          }
        },
      });

      const result = await orch.execute({
        executionId,
        organizationId: orgId,
        request: providerRequest,
        token: liveToken,
        candidates: [
          {
            providerId: chosenProviderId!,
            modelId: chosenModelId ?? "gpt-4o",
            dispatcher,
            primaryOrFailover: "primary" as const,
            positionInRoute: 0,
          },
        ],
      });

      const terminalStatus = result.success ? "succeeded" : "failed";
      const updated: ExecutionResource = {
        ...resource,
        status: terminalStatus,
        updatedAt: host.deps.nowIso(),
        completedAt: host.deps.nowIso(),
        result: result.finalContent
          ? { kind: "text", text: result.finalContent.slice(0, 8_000) }
          : { kind: "empty" },
        errorMessage: result.success ? undefined : "live stream failed",
      };
      host.executionStore.set(executionId, updated);
      if (host.deps.persistence) {
        await host.deps.persistence.executions.update(updated);
      }
      if (planningReport) {
        await applyDeferredStreamPostProcessing(host, {
          handoff,
          planningReport,
          providerId: chosenProviderId!,
          modelId: chosenModelId ?? "gpt-4o",
          terminalStatus,
          streamResult: result,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "live stream failed";
      const failed: ExecutionResource = {
        ...resource,
        status: "failed",
        updatedAt: host.deps.nowIso(),
        completedAt: host.deps.nowIso(),
        errorMessage: message,
        result: { kind: "empty" },
      };
      host.executionStore.set(executionId, failed);
      if (host.deps.persistence) {
        await host.deps.persistence.executions.update(failed);
      }
    } finally {
      closed = true;
      const flush = resolveWait as (() => void) | null;
      resolveWait = null;
      if (flush) flush();
    }
  })();

  return success({
    kind: "live_sse",
    executionId,
    frames: [],
    frameIterable,
    cancel: (reason?: string) => cancel.cancel(reason ?? "client_disconnected"),
  });
}

export async function applyDeferredStreamPostProcessing(
  host: ExecutionCreateHost,
  input: {
  readonly handoff: CanonicalStreamHandoff;
  readonly planningReport: IntelligenceOsIntegrationReport;
  readonly providerId: string;
  readonly modelId: string;
  readonly terminalStatus: ExecutionResource["status"];
  readonly streamResult: StreamingExecutionResult;
  }
): Promise<void> {
  if (!host.deps.integration) return;

  const { executionId, correlationId, trustedOrganizationId } = input.handoff;
  const snapshot = buildIntegrationPlanningSnapshot(
    buildCanonicalIntegrationRequest({
      executionId,
      correlationId,
      trustedOrganizationId,
      providerPrompt: input.handoff.providerPrompt,
      req: input.handoff.req,
      workingMetadata: input.handoff.workingMetadata,
      structuredBrief: input.handoff.structuredBrief,
      principal: input.handoff.principal,
      mode: CANONICAL_STREAM_PLANNING_MODE,
    }),
    input.planningReport
  );
  const runtime = buildProviderRuntimeFromStreamResult({
    executionId,
    providerId: input.providerId,
    modelId: input.modelId,
    result: input.streamResult,
    nowIso: host.deps.nowIso(),
  });
  const postProcessed = await runDeferredIntegrationPostProcessing({
    integration: host.deps.integration,
    snapshot,
    runtime,
  });
  if (!postProcessed.ok) return;

  const existingExtras = host.deps.persistence
    ? ((await host.deps.persistence.extras.get(executionId)) as
        | Readonly<Record<string, unknown>>
        | undefined)
    : (host.extrasStore.get(executionId) as Readonly<Record<string, unknown>> | undefined);

  const merged = mergePostProcessingIntoExtras({
    executionId,
    correlationId,
    report: postProcessed.value,
    executionMode: host.deps.executionMode ?? "stub",
    status: input.terminalStatus,
    existingExtras,
    nowIso: host.deps.nowIso,
    governanceFinalize: host.governanceFinalize,
    organizationId: trustedOrganizationId,
    capabilityId: input.handoff.req.capabilityId,
    objective: input.handoff.structuredBrief?.objective ?? input.handoff.req.prompt,
    brandTone: input.handoff.structuredBrandContext?.tone?.tone,
    createId: host.deps.createId,
  });

  if (host.deps.persistence) {
    await host.deps.persistence.extras.save(
      executionId,
      trustedOrganizationId,
      merged as Parameters<
        typeof host.deps.persistence.extras.save
      >[2]
    );
  } else {
    host.extrasStore.set(executionId, merged as never);
  }
}
