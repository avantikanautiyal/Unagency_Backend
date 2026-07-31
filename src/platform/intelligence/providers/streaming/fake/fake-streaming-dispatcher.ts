/**
 * Fake native streaming dispatcher for offline M9.5O certification.
 * EXTERNAL AI CALLS: 0.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type {
  INativeStreamingDispatcher,
  NativeStreamContext,
} from "../interfaces/native-streaming-dispatcher";
import type { ProviderStreamEvent } from "../contracts/provider-stream-event";

export type FakeStreamScript =
  | { kind: "delta"; text: string; delayMs?: number }
  | { kind: "reasoning"; text: string; delayMs?: number }
  | { kind: "tool_start"; id: string; name: string; delayMs?: number }
  | { kind: "tool_args"; id: string; delta: string; delayMs?: number }
  | { kind: "tool_done"; id: string; delayMs?: number }
  | { kind: "audio"; byteLength: number; mimeType?: string; delayMs?: number }
  | {
      kind: "usage_final";
      promptTokens: number;
      completionTokens: number;
      delayMs?: number;
    }
  | { kind: "fail"; code: string; message: string; delayMs?: number }
  | { kind: "hang"; delayMs: number }
  | {
      kind: "approval_required";
      id: string;
      name: string;
      delayMs?: number;
    };

export interface FakeStreamingDispatcherOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly script: readonly FakeStreamScript[];
  readonly nowIso?: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export class FakeStreamingDispatcher implements INativeStreamingDispatcher {
  readonly nativeIncrementalStreaming = true as const;

  constructor(private readonly opts: FakeStreamingDispatcherOptions) {}

  supportsNativeStreaming(request: ProviderExecutionRequest): boolean {
    return (
      request.streaming === true &&
      String(request.providerId) === this.opts.providerId
    );
  }

  async *stream(
    request: ProviderExecutionRequest,
    context: NativeStreamContext
  ): AsyncIterable<ProviderStreamEvent> {
    const nowIso = this.opts.nowIso ?? (() => new Date().toISOString());
    const sleep = this.opts.sleep ?? defaultSleep;
    const base = {
      executionId: context.executionId,
      attemptId: context.attemptId,
      providerId: this.opts.providerId,
      modelId: this.opts.modelId,
      capabilityId: String(request.capabilityId ?? "text.generate"),
    };
    let sequence = 0;

    yield {
      ...base,
      type: "stream.started",
      sequence: sequence++,
      at: nowIso(),
    };

    for (const step of this.opts.script) {
      if (context.token.cancelled || context.abortSignal?.aborted) {
        yield {
          ...base,
          type: "stream.cancelled",
          sequence: sequence++,
          errorCode: "client_disconnected",
          errorMessage: context.token.reason ?? "cancelled",
          at: nowIso(),
        };
        return;
      }

      const delay = "delayMs" in step ? step.delayMs ?? 0 : 0;
      if (delay > 0) await sleep(delay);

      if (context.token.cancelled || context.abortSignal?.aborted) {
        yield {
          ...base,
          type: "stream.cancelled",
          sequence: sequence++,
          errorCode: "client_disconnected",
          errorMessage: context.token.reason ?? "cancelled",
          at: nowIso(),
        };
        return;
      }

      switch (step.kind) {
        case "delta":
          yield {
            ...base,
            type: "content.delta",
            sequence: sequence++,
            contentDelta: step.text,
            at: nowIso(),
          };
          break;
        case "reasoning":
          yield {
            ...base,
            type: "reasoning.delta",
            sequence: sequence++,
            reasoningDelta: step.text,
            at: nowIso(),
          };
          break;
        case "tool_start":
          yield {
            ...base,
            type: "tool_call.started",
            sequence: sequence++,
            toolCall: { id: step.id, name: step.name },
            at: nowIso(),
          };
          break;
        case "tool_args":
          yield {
            ...base,
            type: "tool_call.arguments.delta",
            sequence: sequence++,
            toolCall: { id: step.id, argumentsDelta: step.delta },
            at: nowIso(),
          };
          break;
        case "tool_done":
          yield {
            ...base,
            type: "tool_call.completed",
            sequence: sequence++,
            toolCall: { id: step.id },
            at: nowIso(),
          };
          break;
        case "audio":
          yield {
            ...base,
            type: "audio.chunk",
            sequence: sequence++,
            audio: {
              byteLength: step.byteLength,
              mimeType: step.mimeType ?? "audio/mpeg",
              bytes: new Uint8Array(step.byteLength),
            },
            at: nowIso(),
          };
          break;
        case "usage_final":
          yield {
            ...base,
            type: "usage.final",
            sequence: sequence++,
            usage: {
              promptTokens: step.promptTokens,
              completionTokens: step.completionTokens,
              totalTokens: step.promptTokens + step.completionTokens,
            },
            at: nowIso(),
          };
          break;
        case "fail":
          yield {
            ...base,
            type: "stream.failed",
            sequence: sequence++,
            errorCode: step.code,
            errorMessage: step.message,
            at: nowIso(),
          };
          return;
        case "approval_required":
          yield {
            ...base,
            type: "tool.approval_required",
            sequence: sequence++,
            toolCall: { id: step.id, name: step.name },
            at: nowIso(),
          };
          return;
        case "hang":
          await sleep(step.delayMs);
          break;
      }
    }

    yield {
      ...base,
      type: "stream.completed",
      sequence: sequence++,
      finishReason: "stop",
      at: nowIso(),
    };
  }
}
