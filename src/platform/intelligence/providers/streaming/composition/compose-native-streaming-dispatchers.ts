/**
 * M9.5O1 — Compose native streaming dispatchers for executable text providers.
 * Credential-free: returns empty map. With keys: returns ready leaves (no network).
 */

import { OPENAI_BASE_URL } from "../../openai/constants";
import { ANTHROPIC_BASE_URL } from "../../anthropic/constants";
import { COMPAT_TEXT_PROVIDER_CONFIGS } from "../../compat/configs/text-provider-configs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  evaluateTextProviderEnv,
  resolveTextProviderCredential,
  OPENAI_TEXT_ENV,
  ANTHROPIC_TEXT_ENV,
} from "../../../../production/execution/text-provider-env";
import { buildStreamingTruthMatrix, isStreamExecutable } from "../capability/streaming-capability-truth";
import {
  FetchStreamHttpTransport,
  type StreamHttpTransport,
} from "../http/stream-http-transport";
import type { INativeStreamingDispatcher } from "../interfaces/native-streaming-dispatcher";
import { createNativeStreamingDispatcher } from "../leaves/create-native-streaming-dispatcher";

function openaiCompatBody(request: ProviderExecutionRequest): string {
  const payload = (request.payload ?? {}) as Record<string, unknown>;
  const messages =
    (payload.messages as unknown[]) ??
    (typeof payload.prompt === "string"
      ? [{ role: "user", content: payload.prompt }]
      : [{ role: "user", content: " " }]);
  const body: Record<string, unknown> = {
    model: request.modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (payload.tools) body.tools = payload.tools;
  if (payload.tool_choice) body.tool_choice = payload.tool_choice;
  if (payload.response_format) body.response_format = payload.response_format;
  if (payload.temperature !== undefined) body.temperature = payload.temperature;
  if (payload.max_tokens !== undefined) body.max_tokens = payload.max_tokens;
  return JSON.stringify(body);
}

function anthropicBody(request: ProviderExecutionRequest): string {
  const payload = (request.payload ?? {}) as Record<string, unknown>;
  const messages =
    (payload.messages as unknown[]) ??
    (typeof payload.prompt === "string"
      ? [{ role: "user", content: payload.prompt }]
      : [{ role: "user", content: " " }]);
  return JSON.stringify({
    model: request.modelId,
    messages,
    max_tokens: payload.max_tokens ?? 1024,
    stream: true,
    ...(payload.tools ? { tools: payload.tools } : {}),
  });
}

export interface ComposeNativeStreamingOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Override transport (FakeStreamHttpTransport in tests). Default: FetchStreamHttpTransport. */
  readonly transport?: StreamHttpTransport;
}

/**
 * Build providerId → native streaming dispatcher for configured+verified providers.
 * Does not open network connections.
 */
export function composeNativeStreamingDispatchers(
  options: ComposeNativeStreamingOptions = {}
): ReadonlyMap<string, INativeStreamingDispatcher> {
  const env = options.env ?? process.env;
  const transport = options.transport ?? new FetchStreamHttpTransport();
  const configured = new Set(
    evaluateTextProviderEnv(env)
      .filter((p) => p.configured || p.enabled)
      .map((p) => p.providerId)
  );
  const matrix = buildStreamingTruthMatrix({ configuredProviderIds: configured });
  const out = new Map<string, INativeStreamingDispatcher>();

  for (const truth of matrix) {
    if (!isStreamExecutable(truth)) continue;

    if (truth.providerId === "provider.openai") {
      const key = resolveTextProviderCredential(env, OPENAI_TEXT_ENV.credentialEnvVar);
      if (!key) continue;
      const d = createNativeStreamingDispatcher({
        providerId: truth.providerId,
        transport,
        configuredProviderIds: configured,
        buildRequest: (request) => ({
          url: `${OPENAI_BASE_URL}/chat/completions`,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: openaiCompatBody(request),
        }),
      });
      if (d) out.set(truth.providerId, d);
      continue;
    }

    if (truth.providerId === "provider.anthropic") {
      const key = resolveTextProviderCredential(env, ANTHROPIC_TEXT_ENV.credentialEnvVar);
      if (!key) continue;
      const d = createNativeStreamingDispatcher({
        providerId: truth.providerId,
        transport,
        configuredProviderIds: configured,
        buildRequest: (request) => ({
          url: `${ANTHROPIC_BASE_URL}/v1/messages`,
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: anthropicBody(request),
        }),
      });
      if (d) out.set(truth.providerId, d);
      continue;
    }

    if (truth.wireFamily === "openai_compatible") {
      const config = COMPAT_TEXT_PROVIDER_CONFIGS.find(
        (c) => c.canonicalProviderId === truth.providerId
      );
      if (!config) continue;
      const key = resolveTextProviderCredential(env, config.credentialEnvVar);
      if (!key) continue;
      const d = createNativeStreamingDispatcher({
        providerId: truth.providerId,
        transport,
        configuredProviderIds: configured,
        buildRequest: (request) => ({
          url: `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: openaiCompatBody(request),
        }),
      });
      if (d) out.set(truth.providerId, d);
    }
  }

  return out;
}
