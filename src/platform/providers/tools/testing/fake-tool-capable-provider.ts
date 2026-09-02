/**
 * Scripted fake provider dispatcher for offline tool-loop certification.
 * Zero network — returns canned tool_calls / final answers based on round.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError } from "../../../core/errors";
import { asProviderId } from "../../../core/identifiers";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { IProviderDispatcher } from "../../runtime/interfaces/provider-dispatcher";
import type { StreamingChunk } from "../../runtime/contracts/streaming";

export type FakeProviderScript =
  | { readonly kind: "tool_calls"; readonly toolCalls: readonly Record<string, unknown>[] }
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "json"; readonly content: string }
  | { readonly kind: "provider_error"; readonly message: string };

export class ScriptedToolProviderDispatcher implements IProviderDispatcher {
  attempts = 0;
  lastRequests: ProviderExecutionRequest[] = [];

  constructor(
    private readonly scripts: readonly FakeProviderScript[],
    private readonly providerId = "provider.openai"
  ) {}

  supportsStreaming(): boolean {
    return false;
  }

  getLastArtifacts(): Readonly<Record<string, unknown>> {
    return {};
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this.attempts += 1;
    this.lastRequests.push(request);
    const script = this.scripts[Math.min(this.attempts - 1, this.scripts.length - 1)]!;
    if (script.kind === "provider_error") {
      return failure(new ProviderError(script.message));
    }

    const output: Record<string, unknown> =
      script.kind === "tool_calls"
        ? {
            content: null,
            tool_calls: script.toolCalls,
            finishReason: "tool_call",
          }
        : {
            content: script.content,
            finishReason: "stop",
          };

    return success({
      requestId: request.requestId,
      providerId: asProviderId(this.providerId),
      output: Object.freeze(output),
      usage: Object.freeze({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    _onChunk: (chunk: StreamingChunk) => void
  ): Promise<Result<ProviderExecutionResponse>> {
    return this.dispatch(request, token);
  }
}

export function openaiFunctionCall(input: {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: input.id,
    type: "function",
    function: {
      name: input.name,
      arguments: JSON.stringify(input.arguments),
    },
  };
}
