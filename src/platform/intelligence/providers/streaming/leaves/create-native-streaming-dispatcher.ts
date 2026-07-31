/**
 * M9.5O1 — Factory for native streaming leaves (OpenAI / Anthropic / openai_compatible).
 * Inject transport (FakeStreamHttpTransport offline; FetchStreamHttpTransport for LIVE).
 * Does not invent Gemini/Cohere parsers.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  buildStreamingTruthMatrix,
  isStreamExecutable,
} from "../capability/streaming-capability-truth";
import type { StreamHttpTransport } from "../http/stream-http-transport";
import type { INativeStreamingDispatcher } from "../interfaces/native-streaming-dispatcher";
import { AnthropicNativeStreamingDispatcher } from "./anthropic-native-streaming-dispatcher";
import { OpenAiCompatNativeStreamingDispatcher } from "./openai-compat-native-streaming-dispatcher";

export type NativeStreamRequestBuilder = (request: ProviderExecutionRequest) => {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
};

export interface CreateNativeStreamingDispatcherInput {
  readonly providerId: string;
  readonly transport: StreamHttpTransport;
  readonly buildRequest: NativeStreamRequestBuilder;
  readonly configuredProviderIds: ReadonlySet<string>;
  readonly maxEventBytes?: number;
}

/**
 * Returns a native dispatcher only when capability truth says the provider is
 * runtime-implemented. Executable still requires configured=true at routing time.
 */
export function createNativeStreamingDispatcher(
  input: CreateNativeStreamingDispatcherInput
): INativeStreamingDispatcher | null {
  const truth = buildStreamingTruthMatrix({
    configuredProviderIds: input.configuredProviderIds,
  }).find((t) => t.providerId === input.providerId);

  if (!truth?.parserImplemented || !truth.streamingRuntimeImplemented) {
    return null;
  }
  if (!truth.nativeStreamingVerified) {
    return null;
  }

  if (truth.wireFamily === "anthropic") {
    return new AnthropicNativeStreamingDispatcher({
      providerId: input.providerId,
      transport: input.transport,
      buildRequest: input.buildRequest,
      maxEventBytes: input.maxEventBytes,
      nativeStreamingVerified: true,
    });
  }

  if (truth.wireFamily === "openai" || truth.wireFamily === "openai_compatible") {
    return new OpenAiCompatNativeStreamingDispatcher({
      providerId: input.providerId,
      wireFamily: truth.wireFamily,
      transport: input.transport,
      buildRequest: input.buildRequest,
      maxEventBytes: input.maxEventBytes,
      nativeStreamingVerified: true,
    });
  }

  return null;
}

/** Guard used by routing: only executable when configured + verified + parser. */
export function nativeStreamingCandidateAllowed(
  providerId: string,
  configuredProviderIds: ReadonlySet<string>
): boolean {
  const truth = buildStreamingTruthMatrix({ configuredProviderIds }).find(
    (t) => t.providerId === providerId
  );
  return truth ? isStreamExecutable(truth) : false;
}
