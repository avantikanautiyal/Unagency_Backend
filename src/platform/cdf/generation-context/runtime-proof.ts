/**
 * Phase 3 — Runtime proof harness.
 *
 * Mirrors the live CDF create wire after prepass:
 *   orchestrateCanonicalGenerationContext (same as execution-create-prepass)
 *     → stampPresentationCreateMetadata
 *     → DirectExecutionEngine
 *     → provider dispatcher (transport mocked)
 *
 * Does not call compileCanonicalGenerationRequest in isolation.
 */

import { asOrganizationId } from "../../core/identifiers";
import { createDirectExecutionEngine } from "../../direct/direct-execution-engine";
import { stampPresentationCreateMetadata } from "../../direct/presentation-direct-metadata";
import { stampCanonicalStructuredOutputMetadata } from "../structured-output-contract";
import { createProviderRuntime } from "../../providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../providers/runtime/testing";
import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import { createToolRuntimePlatform } from "../../providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../providers/tools/idempotency/in-memory-tool-invocation-store";
import { orchestrateCanonicalGenerationContext } from "../../ai/context-orchestrator";
import type { CanonicalContextApplyResult } from "./apply";
import {
  getLatestCanonicalTraceEvent,
  type CanonicalGenerationTraceEvent,
} from "./trace";

export type CanonicalRuntimeProofInput = {
  prompt: string;
  metadata: Record<string, unknown>;
  organizationId: string;
  projectId?: string;
  conversationalInstruction?: string;
  conversationMessages?: import("../../ai/conversation-working-memory").WorkingMemorySourceMessage[];
  executionId?: string;
  /** When true, skip DirectEngine if apply fails (default). */
  skipProviderOnApplyFailure?: boolean;
};

export type CanonicalRuntimeProofResult = {
  apply: CanonicalContextApplyResult;
  providerInvoked: boolean;
  dispatcherAttempts: number;
  capturedRequests: ProviderExecutionRequest[];
  providerPrompt: string;
  stampedMetadata: Record<string, unknown>;
  compiledTrace?: CanonicalGenerationTraceEvent;
  boundaryTrace?: CanonicalGenerationTraceEvent;
  engineOk?: boolean;
  engineError?: string;
};

class CapturingDispatcher extends ControllableDispatcher {
  readonly captured: ProviderExecutionRequest[] = [];

  override async dispatch(
    request: ProviderExecutionRequest,
    token: Parameters<ControllableDispatcher["dispatch"]>[1],
  ) {
    this.captured.push(request);
    return super.dispatch(request, token);
  }
}

function extractProviderPrompt(req: ProviderExecutionRequest | undefined): string {
  if (!req?.payload) return "";
  const p = req.payload;
  if (typeof p.prompt === "string" && p.prompt) return p.prompt;
  if (typeof p.text === "string" && p.text) return p.text;
  if (typeof p.input === "string" && p.input) return p.input;
  const messages = p.messages;
  if (Array.isArray(messages)) {
    return messages
      .map((m) =>
        m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string"
          ? String((m as { content: string }).content)
          : "",
      )
      .join("\n");
  }
  return "";
}

/**
 * Exercise canonical bridge + DirectExecutionEngine provider boundary.
 * External provider transport is ControllableDispatcher only (no network).
 */
export async function runCanonicalGenerationRuntimeProof(
  input: CanonicalRuntimeProofInput,
): Promise<CanonicalRuntimeProofResult> {
  const executionId =
    input.executionId ??
    (typeof input.metadata.apiExecutionId === "string"
      ? input.metadata.apiExecutionId
      : typeof input.metadata.executionId === "string"
        ? input.metadata.executionId
        : `exec_p3_${Date.now()}`);

  const metadata: Record<string, unknown> = {
    ...input.metadata,
    apiExecutionId: executionId,
    executionId,
    correlationId:
      typeof input.metadata.correlationId === "string"
        ? input.metadata.correlationId
        : executionId,
  };

  const applyRaw = orchestrateCanonicalGenerationContext({
    prompt: input.prompt,
    metadata,
    organizationId: input.organizationId,
    projectId: input.projectId,
    conversationalInstruction: input.conversationalInstruction,
    conversationMessages: input.conversationMessages,
  });
  // Map orchestrator result to apply-shaped result for proof consumers.
  const apply =
    !applyRaw.ok
      ? {
          ok: false as const,
          code: applyRaw.code,
          message: applyRaw.message,
          details: applyRaw.details,
        }
      : applyRaw.skipped
        ? {
            ok: true as const,
            skipped: true as const,
            prompt: applyRaw.prompt,
            metadata: applyRaw.metadata,
          }
        : {
            ok: true as const,
            skipped: false as const,
            request: applyRaw.request,
            modelRequest: applyRaw.modelRequest,
            prompt: applyRaw.prompt,
            metadata: applyRaw.metadata,
          };

  if (!apply.ok) {
    return {
      apply,
      providerInvoked: false,
      dispatcherAttempts: 0,
      capturedRequests: [],
      providerPrompt: "",
      stampedMetadata: metadata,
      compiledTrace: getLatestCanonicalTraceEvent("cdf.generation_context.compiled"),
      boundaryTrace: undefined,
      engineOk: false,
      engineError: apply.message,
    };
  }

  const stampedMetadata = stampCanonicalStructuredOutputMetadata(
    stampPresentationCreateMetadata(apply.metadata),
  );
  const dispatcher = new CapturingDispatcher({ mode: "success" });
  const runtime = createProviderRuntime({ dispatcher });
  const toolRuntime = createToolRuntimePlatform({
    dispatcher,
    runtime,
    invocationStore: new InMemoryToolInvocationStore(),
    durable: false,
  });
  const engine = createDirectExecutionEngine({ runtime, toolRuntime });

  const modelRequest =
    !apply.skipped && "modelRequest" in apply
      ? apply.modelRequest
      : undefined;

  const engineResult = await engine.run({
    requestId: `req_${executionId}`,
    rawPrompt: apply.prompt,
    ...(modelRequest ? { canonicalModelRequest: modelRequest } : {}),
    organizationId: asOrganizationId(input.organizationId),
    correlationId: String(stampedMetadata.correlationId ?? executionId),
    metadata: stampedMetadata,
  });

  const boundaryTrace = getLatestCanonicalTraceEvent(
    "cdf.generation_context.provider_boundary",
  );
  const compiledTrace = getLatestCanonicalTraceEvent(
    "cdf.generation_context.compiled",
  );
  const lastCaptured = dispatcher.captured[dispatcher.captured.length - 1];
  const runtimeMeta =
    lastCaptured?.metadata && typeof lastCaptured.metadata === "object"
      ? (lastCaptured.metadata as Record<string, unknown>)
      : {};

  return {
    apply,
    providerInvoked: dispatcher.attempts > 0,
    dispatcherAttempts: dispatcher.attempts,
    capturedRequests: [...dispatcher.captured],
    providerPrompt: extractProviderPrompt(lastCaptured),
    stampedMetadata: {
      ...stampedMetadata,
      ...(runtimeMeta.modelRuntimeApplied === true
        ? {
            modelRuntimeApplied: true,
            modelRuntimeSource: runtimeMeta.modelRuntimeSource,
            modelRuntimeRepresentationStrategy:
              runtimeMeta.modelRuntimeRepresentationStrategy,
          }
        : {}),
    },
    compiledTrace,
    boundaryTrace,
    engineOk: engineResult.ok,
    engineError: engineResult.ok ? undefined : String(engineResult.error.message),
  };
}
