/**
 * Anthropic provider factory.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import { buildTextProviderManifest } from "../../common/build-text-provider-manifest";
import { AnthropicProviderAdapter } from "../adapters/anthropic-adapter";
import { AnthropicDispatcher } from "../dispatcher/anthropic-dispatcher";
import {
  FetchAnthropicHttpClient,
  type AnthropicAuthConfig,
  type IAnthropicHttpClient,
} from "../http/anthropic-http-client";
import { SimulatedAnthropicHttpClient } from "../http/simulated-anthropic-http-client";
import { AnthropicSdkClient } from "../sdk/anthropic-sdk-client";
import {
  ANTHROPIC_PROVIDER_ID,
  ANTHROPIC_PROVIDER_VERSION,
  ANTHROPIC_VENDOR,
  ANTHROPIC_SEED_MODELS,
  ANTHROPIC_VISION_MODELS,
} from "../constants";

export interface AnthropicProviderPlatform {
  readonly mode: "simulated" | "live";
  readonly adapter: AnthropicProviderAdapter;
  readonly sdk: AnthropicSdkClient;
  readonly dispatcher: AnthropicDispatcher;
  readonly manifest: ProviderManifest;
}

export interface CreateAnthropicProviderOptions {
  readonly mode?: "simulated" | "live";
  readonly auth?: AnthropicAuthConfig;
  readonly httpClient?: IAnthropicHttpClient;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

function buildManifest(nowIso: string): ProviderManifest {
  return buildTextProviderManifest({
    providerId: ANTHROPIC_PROVIDER_ID,
    vendor: ANTHROPIC_VENDOR,
    displayName: "Anthropic",
    version: ANTHROPIC_PROVIDER_VERSION,
    wireModels: ANTHROPIC_SEED_MODELS,
    visionWireModels: ANTHROPIC_VISION_MODELS,
    capabilities: ["text.generate", "text.chat", "reasoning.analyze", "vision.analyze"],
    nowIso,
  });
}

export function createAnthropicProvider(
  options: CreateAnthropicProviderOptions = {}
): Result<AnthropicProviderPlatform> {
  const mode = options.mode ?? (options.auth?.apiKey ? "live" : "simulated");
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const http: IAnthropicHttpClient =
    options.httpClient ??
    (mode === "live"
      ? new FetchAnthropicHttpClient(options.auth ?? {}, clockMs)
      : new SimulatedAnthropicHttpClient(clockMs));

  const manifest = buildManifest(nowIso());
  const adapter = new AnthropicProviderAdapter(manifest, { nowIso });
  const sdk = new AnthropicSdkClient(http, options.auth ?? {}, nowIso, clockMs);
  const dispatcher = new AnthropicDispatcher(adapter, sdk, nowIso, clockMs);

  return success({ mode, adapter, sdk, dispatcher, manifest });
}
