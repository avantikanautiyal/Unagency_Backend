/**
 * Enterprise streaming execution — reuses M9.5O StreamingExecutionOrchestrator.
 * Simulated mode: FakeStreamingDispatcher only (0 external AI calls).
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError, AuthorizationError } from "../../intelligence/shared/errors";
import {
  asCapabilityId,
  asOrganizationId,
  asProviderId,
} from "../../intelligence/shared/identifiers";
import type {
  AuthPrincipal,
  CreateExecutionRequest,
  ExecutionResource,
  SseFrame,
  TenantContext,
} from "../contracts";
import {
  FakeStreamingDispatcher,
  StreamingExecutionOrchestrator,
  providerStreamEventToSse,
  type FakeStreamScript,
  type ProviderStreamEvent,
} from "../../intelligence/providers/streaming";
import type { ProviderExecutionRequest } from "../../intelligence/providers/runtime/contracts/provider-execution-request";
import { CancellationSource } from "../../intelligence/providers/runtime/cancellation/cancellation-engine";

export type LiveSseExecutionPayload = {
  readonly kind: "live_sse";
  readonly executionId: string;
  readonly frames: readonly SseFrame[];
  readonly frameIterable: AsyncIterable<SseFrame>;
  readonly cancel: (reason?: string) => void;
};

export function isLiveSsePayload(value: unknown): value is LiveSseExecutionPayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: string }).kind === "live_sse" &&
    typeof (value as LiveSseExecutionPayload).executionId === "string" &&
    !!(value as LiveSseExecutionPayload).frameIterable
  );
}

/** Product-safe SSE — no CoT, no raw tool arg fragments, no provider wire IDs. */
export function toProductSseFrame(event: ProviderStreamEvent): SseFrame {
  const frame = providerStreamEventToSse(event);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(frame.data) as Record<string, unknown>;
  } catch {
    return frame;
  }
  delete data.providerId;
  delete data.modelId;
  delete data.attemptId;
  delete data.reasoningDelta;
  if (data.toolCall && typeof data.toolCall === "object") {
    const tc = { ...(data.toolCall as Record<string, unknown>) };
    delete tc.argumentsDelta;
    data.toolCall = tc;
  }
  return { event: frame.event, id: frame.id, data: JSON.stringify(data) };
}

export type EnterpriseStreamingDeps = {
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly saveExecution: (resource: ExecutionResource) => Promise<void> | void;
  readonly getScript?: (prompt: string) => readonly FakeStreamScript[];
};

const PRIMARY_PROVIDER = "provider.stream_sim";
const PRIMARY_MODEL = "model.stream_sim";
const FAILOVER_PROVIDER = "provider.stream_sim_b";
const FAILOVER_MODEL = "model.stream_sim_b";

export function defaultSimulatedStreamScript(prompt: string): readonly FakeStreamScript[] {
  const preview = prompt.trim().slice(0, 40) || "your brief";
  if (prompt.includes("__stream_approval__")) {
    return [
      { kind: "delta", text: "Drafting", delayMs: 0 },
      { kind: "delta", text: " plan…", delayMs: 0 },
      { kind: "tool_start", id: "inv_stream_1", name: "update_test_record", delayMs: 0 },
      { kind: "tool_args", id: "inv_stream_1", delta: '{"campaign', delayMs: 0 },
      { kind: "tool_args", id: "inv_stream_1", delta: 'Name":"x"}', delayMs: 0 },
      { kind: "tool_done", id: "inv_stream_1", delayMs: 0 },
      {
        kind: "approval_required",
        id: "inv_stream_1",
        name: "update_test_record",
        delayMs: 0,
      },
    ];
  }
  if (prompt.includes("__post_commit_fail__")) {
    return [
      { kind: "delta", text: "Partial", delayMs: 0 },
      { kind: "delta", text: " output", delayMs: 0 },
      {
        kind: "fail",
        code: "provider_internal",
        message: "provider failed after commit",
        delayMs: 0,
      },
    ];
  }
  if (prompt.includes("__malformed_oversized__")) {
    return [
      { kind: "delta", text: "x".repeat(300_000), delayMs: 0 },
    ];
  }
  return [
    { kind: "delta", text: "Create", delayMs: 0 },
    { kind: "delta", text: " a", delayMs: 0 },
    { kind: "delta", text: " launch", delayMs: 0 },
    { kind: "delta", text: " plan", delayMs: 0 },
    { kind: "delta", text: ` for: ${preview}`, delayMs: 0 },
    { kind: "usage_final", promptTokens: 12, completionTokens: 18 },
  ];
}

function preCommitFailPrimaryScript(): readonly FakeStreamScript[] {
  return [
    {
      kind: "fail",
      code: "fail_before_output",
      message: "primary unavailable before commit",
      delayMs: 0,
    },
  ];
}

export async function startEnterpriseSimulatedStream(input: {
  readonly req: CreateExecutionRequest;
  readonly principal: AuthPrincipal;
  readonly tenant: TenantContext;
  readonly deps: EnterpriseStreamingDeps;
  readonly abortSignal?: AbortSignal;
}): Promise<Result<LiveSseExecutionPayload>> {
  const orgId = input.principal.organizationId ?? input.tenant.organizationId;
  if (!orgId) {
    return failure(new AuthorizationError("organisation required"));
  }
  if (
    input.principal.organizationId &&
    input.principal.organizationId !== orgId
  ) {
    return failure(new AuthorizationError("tenant isolation violation"));
  }
  if (!input.req.prompt?.trim()) {
    return failure(new ValidationError("prompt required"));
  }

  const executionId = input.deps.createId("exec");
  const now = input.deps.nowIso();
  const correlationId = input.deps.createId("corr");

  const resource: ExecutionResource = {
    executionId,
    status: "streaming",
    organizationId: orgId,
    workspaceId: input.req.workspaceId ?? input.tenant.workspaceId,
    capabilityId: input.req.capabilityId ?? "text.generate",
    correlationId,
    createdAt: now,
    updatedAt: now,
    promptPreview: input.req.prompt.slice(0, 120),
    result: { kind: "pending" },
  };
  await input.deps.saveExecution(resource);

  const prompt = input.req.prompt;
  const script =
    input.deps.getScript?.(prompt) ?? defaultSimulatedStreamScript(prompt);
  const sleep = input.deps.sleep ?? (async () => undefined);

  const primary = new FakeStreamingDispatcher({
    providerId: PRIMARY_PROVIDER,
    modelId: PRIMARY_MODEL,
    script: prompt.includes("__pre_commit_failover__")
      ? preCommitFailPrimaryScript()
      : script,
    nowIso: input.deps.nowIso,
    sleep,
  });

  const candidates: {
    providerId: string;
    modelId: string;
    dispatcher: FakeStreamingDispatcher;
    primaryOrFailover: "primary" | "failover";
    positionInRoute: number;
  }[] = [
    {
      providerId: PRIMARY_PROVIDER,
      modelId: PRIMARY_MODEL,
      dispatcher: primary,
      primaryOrFailover: "primary",
      positionInRoute: 0,
    },
  ];

  if (prompt.includes("__pre_commit_failover__")) {
    candidates.push({
      providerId: FAILOVER_PROVIDER,
      modelId: FAILOVER_MODEL,
      dispatcher: new FakeStreamingDispatcher({
        providerId: FAILOVER_PROVIDER,
        modelId: FAILOVER_MODEL,
        script: defaultSimulatedStreamScript("failover recovery"),
        nowIso: input.deps.nowIso,
        sleep,
      }),
      primaryOrFailover: "failover",
      positionInRoute: 1,
    });
  }

  if (prompt.includes("__post_commit_fail__")) {
    // Secondary present but must NOT be used after commit (orchestrator blocks).
    candidates.push({
      providerId: FAILOVER_PROVIDER,
      modelId: FAILOVER_MODEL,
      dispatcher: new FakeStreamingDispatcher({
        providerId: FAILOVER_PROVIDER,
        modelId: FAILOVER_MODEL,
        script: [
          { kind: "delta", text: "SHOULD_NOT_APPEAR", delayMs: 0 },
        ],
        nowIso: input.deps.nowIso,
        sleep,
      }),
      primaryOrFailover: "failover",
      positionInRoute: 1,
    });
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
  const cancelStream = (reason?: string) => {
    cancel.cancel(reason ?? "client_disconnected");
  };
  if (input.abortSignal) {
    const onAbort = () => cancelStream("client_disconnected");
    if (input.abortSignal.aborted) onAbort();
    else input.abortSignal.addEventListener("abort", onAbort, { once: true });
  }

  const frameQueue: SseFrame[] = [];
  let resolveWait: (() => void) | null = null;
  let closed = false;

  const pushFrame = (frame: SseFrame) => {
    frameQueue.push(frame);
    resolveWait?.();
    resolveWait = null;
  };

  const frameIterable: AsyncIterable<SseFrame> = {
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
          return { value: undefined as unknown as SseFrame, done: true };
        },
      };
    },
  };

  void (async () => {
    let approvalTool: { id: string; name: string } | undefined;

    const orch = new StreamingExecutionOrchestrator({
      nowIso: input.deps.nowIso,
      sleep,
      createId: input.deps.createId,
      onEvent: async (event) => {
        if (event.type === "tool.approval_required" && event.toolCall?.id) {
          approvalTool = {
            id: event.toolCall.id,
            name: event.toolCall.name ?? "tool",
          };
        }
        // Product stream: strip CoT + raw tool arg deltas (never render fragments).
        if (event.type === "reasoning.delta") return;
        if (event.type === "tool_call.arguments.delta") return;
        pushFrame(toProductSseFrame(event));
      },
    });

    const providerRequest: ProviderExecutionRequest = {
      requestId: `${executionId}_stream`,
      context: {
        executionId: executionId as never,
        organizationId: asOrganizationId(orgId),
        correlationId,
      } as never,
      capabilityId: asCapabilityId(input.req.capabilityId ?? "text.generate"),
      providerId: asProviderId(PRIMARY_PROVIDER),
      modelId: PRIMARY_MODEL,
      payload: { prompt },
      retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
      timeoutPolicy: { executionTimeoutMs: 60_000 },
      streaming: true,
      priority: 0,
      createdAt: input.deps.nowIso(),
    };

    try {
      const result = await orch.execute({
        executionId,
        organizationId: orgId,
        request: providerRequest,
        token: liveToken,
        candidates,
      });

      const terminalStatus =
        result.terminationReason === "cancelled" ||
        result.terminationReason === "client_disconnected" ||
        result.terminationReason === "user_cancelled"
          ? "cancelled"
          : result.terminationReason === "approval_required"
            ? "awaiting_approval"
            : result.success
              ? "succeeded"
              : "failed";

      const pendingApprovals =
        terminalStatus === "awaiting_approval" && approvalTool
          ? [
              {
                invocationId: approvalTool.id,
                toolName: approvalTool.name,
                displayName:
                  approvalTool.name === "update_test_record"
                    ? "Save draft record"
                    : approvalTool.name,
                description:
                  "AI wants permission to create a campaign draft.",
                argumentsSummary: {},
                requestedAt: input.deps.nowIso(),
              },
            ]
          : undefined;

      const updated: ExecutionResource = {
        ...resource,
        status: terminalStatus,
        updatedAt: input.deps.nowIso(),
        completedAt:
          terminalStatus === "awaiting_approval" ? undefined : input.deps.nowIso(),
        approvalRequired: terminalStatus === "awaiting_approval",
        toolInvocationKey: approvalTool?.id,
        pendingApprovals,
        result:
          terminalStatus === "succeeded"
            ? {
                kind: "text",
                text: result.finalContent.slice(0, 8_000),
              }
            : terminalStatus === "awaiting_approval"
              ? {
                  kind: "tool_approval_required",
                  data: { pendingApprovals },
                }
              : terminalStatus === "cancelled"
                ? {
                    kind: "text",
                    text: result.finalContent
                      ? result.finalContent.slice(0, 8_000)
                      : undefined,
                  }
                : result.finalContent
                  ? {
                      kind: "text",
                      text: result.finalContent.slice(0, 8_000),
                    }
                  : { kind: "empty" },
        errorMessage: result.success
          ? undefined
          : terminalStatus === "cancelled"
            ? undefined
            : result.terminationReason || "stream failed",
        cost: result.cost?.amount ?? null,
      };
      await input.deps.saveExecution(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream failed";
      await input.deps.saveExecution({
        ...resource,
        status: "failed",
        updatedAt: input.deps.nowIso(),
        completedAt: input.deps.nowIso(),
        errorMessage: message,
        result: { kind: "empty" },
      });
      pushFrame(
        toProductSseFrame({
          type: "stream.failed",
          executionId,
          providerId: PRIMARY_PROVIDER,
          modelId: PRIMARY_MODEL,
          capabilityId: "text.generate",
          sequence: 9999,
          errorCode: "stream_error",
          errorMessage: message,
          at: input.deps.nowIso(),
        })
      );
    } finally {
      closed = true;
      resolveWait?.();
      resolveWait = null;
    }
  })();

  return success({
    kind: "live_sse",
    executionId,
    frames: [],
    frameIterable,
    cancel: cancelStream,
  });
}
