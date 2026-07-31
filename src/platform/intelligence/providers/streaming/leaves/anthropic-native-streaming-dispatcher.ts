/**
 * M9.5O1 — Anthropic Messages native streaming dispatcher.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type {
  INativeStreamingDispatcher,
  NativeStreamContext,
} from "../interfaces/native-streaming-dispatcher";
import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import { mapAnthropicSseEvent } from "../parsers/anthropic-stream-mapper";
import {
  type StreamHttpTransport,
  readSseEvents,
} from "../http/stream-http-transport";

export interface AnthropicNativeStreamingOptions {
  readonly providerId: string;
  readonly transport: StreamHttpTransport;
  readonly buildRequest: (request: ProviderExecutionRequest) => {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: string;
  };
  readonly nowIso?: () => string;
  readonly maxEventBytes?: number;
  readonly nativeStreamingVerified: true;
}

export class AnthropicNativeStreamingDispatcher
  implements INativeStreamingDispatcher
{
  readonly nativeIncrementalStreaming = true as const;

  constructor(private readonly opts: AnthropicNativeStreamingOptions) {}

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
    const seq = { value: 0 };
    const toolState: { currentId?: string; currentName?: string } = {};

    yield {
      ...base,
      type: "stream.started",
      sequence: seq.value++,
      at: nowIso(),
    };

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
            at: nowIso(),
          };
          return;
        }
        const mapped = mapAnthropicSseEvent(
          sse,
          {
            executionId: context.executionId,
            attemptId: context.attemptId,
            providerId: this.opts.providerId,
            modelId,
            capabilityId,
            nowIso,
          },
          seq,
          toolState
        );
        for (const ev of mapped.events) yield ev;
        if (mapped.done) {
          if (!mapped.error) {
            yield {
              ...base,
              type: "stream.completed",
              sequence: seq.value++,
              finishReason: "end_turn",
              at: nowIso(),
            };
          }
          return;
        }
      }

      yield {
        ...base,
        type: "stream.failed",
        sequence: seq.value++,
        errorCode: "eof_without_terminal",
        errorMessage: "Anthropic SSE ended without message_stop",
        at: nowIso(),
      };
    } catch (err) {
      const aborted =
        context.abortSignal?.aborted ||
        (err instanceof Error && err.name === "AbortError");
      yield {
        ...base,
        type: aborted ? "stream.cancelled" : "stream.failed",
        sequence: seq.value++,
        errorCode: aborted ? "aborted" : "stream_transport_error",
        errorMessage: err instanceof Error ? err.message : String(err),
        at: nowIso(),
      };
    }
  }
}
