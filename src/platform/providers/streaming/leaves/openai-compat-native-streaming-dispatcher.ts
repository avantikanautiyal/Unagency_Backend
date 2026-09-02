/**
 * M9.5O1 — OpenAI / OpenAI-compat native streaming dispatcher.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type {
  INativeStreamingDispatcher,
  NativeStreamContext,
} from "../interfaces/native-streaming-dispatcher";
import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import { mapOpenAiCompatSseData } from "../parsers/openai-compat-stream-mapper";
import {
  type StreamHttpTransport,
  readSseEvents,
} from "../http/stream-http-transport";

export interface OpenAiCompatNativeStreamingOptions {
  readonly providerId: string;
  readonly wireFamily: "openai" | "openai_compatible";
  readonly transport: StreamHttpTransport;
  /** Build POST body for chat/completions streaming. */
  readonly buildRequest: (request: ProviderExecutionRequest) => {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: string;
  };
  readonly nowIso?: () => string;
  readonly maxEventBytes?: number;
  readonly nativeStreamingVerified: true;
}

export class OpenAiCompatNativeStreamingDispatcher
  implements INativeStreamingDispatcher
{
  readonly nativeIncrementalStreaming = true as const;

  constructor(private readonly opts: OpenAiCompatNativeStreamingOptions) {}

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
    const capabilityId = String(request.capabilityId ?? "text.generate");
    const modelId = request.modelId ?? "unknown";
    const base = {
      executionId: context.executionId,
      attemptId: context.attemptId,
      providerId: this.opts.providerId,
      modelId,
      capabilityId,
    };
    let sequence = 0;

    yield {
      ...base,
      type: "stream.started",
      sequence: sequence++,
      at: nowIso(),
    };

    const seq = { value: sequence };
    let completed = false;
    const toolIdsByIndex = new Map<number, string>();

    try {
      const built = this.opts.buildRequest(request);
      const opened = await this.opts.transport.openSse({
        url: built.url,
        method: "POST",
        headers: built.headers,
        body: built.body,
        signal: context.abortSignal,
      });

      if (opened.status >= 400) {
        yield {
          ...base,
          type: "stream.failed",
          sequence: seq.value++,
          errorCode: `http_${opened.status}`,
          errorMessage: `provider HTTP ${opened.status}`,
          at: nowIso(),
        };
        return;
      }

      for await (const sse of readSseEvents(opened.body, {
        signal: context.abortSignal,
        maxEventBytes: this.opts.maxEventBytes,
      })) {
        if (context.token.cancelled || context.abortSignal?.aborted) {
          yield {
            ...base,
            type: "stream.cancelled",
            sequence: seq.value++,
            errorCode: "client_disconnected",
            errorMessage: context.token.reason ?? "cancelled",
            at: nowIso(),
          };
          return;
        }

        const mapped = mapOpenAiCompatSseData(
          sse,
          {
            executionId: context.executionId,
            attemptId: context.attemptId,
            providerId: this.opts.providerId,
            modelId,
            capabilityId,
            nowIso,
            toolIdsByIndex,
          },
          seq
        );
        for (const ev of mapped.events) yield ev;
        if (mapped.done) {
          completed = true;
          if (!mapped.error) {
            yield {
              ...base,
              type: "stream.completed",
              sequence: seq.value++,
              finishReason: "stop",
              at: nowIso(),
            };
          }
          return;
        }
      }

      if (!completed) {
        yield {
          ...base,
          type: "stream.failed",
          sequence: seq.value++,
          errorCode: "eof_without_terminal",
          errorMessage: "SSE ended without [DONE]",
          at: nowIso(),
        };
      }
    } catch (err) {
      const aborted =
        context.abortSignal?.aborted ||
        (err instanceof Error &&
          (err.name === "AbortError" || String(err.message).includes("abort")));
      if (aborted) {
        yield {
          ...base,
          type: "stream.cancelled",
          sequence: seq.value++,
          errorCode: "aborted",
          errorMessage: context.token.reason ?? "aborted",
          at: nowIso(),
        };
        return;
      }
      if (err instanceof Error && err.message === "STREAM_EVENT_TOO_LARGE") {
        yield {
          ...base,
          type: "stream.failed",
          sequence: seq.value++,
          errorCode: "stream_event_too_large",
          errorMessage: "SSE event exceeded max bytes",
          at: nowIso(),
        };
        return;
      }
      yield {
        ...base,
        type: "stream.failed",
        sequence: seq.value++,
        errorCode: "stream_transport_error",
        errorMessage: err instanceof Error ? err.message : String(err),
        at: nowIso(),
      };
    }
  }
}
