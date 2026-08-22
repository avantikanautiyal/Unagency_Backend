/**
 * Factory for OpenAI-compatible text provider leaves.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import { buildTextProviderManifest } from "../../common/build-text-provider-manifest";
import { asProviderId } from "../../../shared/identifiers";
import type { TextProviderAuthConfig, TextProviderConfig } from "../contracts/text-provider-config";
import { CompatTextAdapter } from "../adapters/compat-text-adapter";
import { CompatTextDispatcher } from "../dispatcher/compat-text-dispatcher";
import { FetchCompatHttpClient, type ICompatHttpClient } from "../http/compat-http-client";
import { SimulatedCompatHttpClient } from "../http/simulated-compat-http-client";
import { CompatSdkClient } from "../sdk/compat-sdk-client";

export interface CompatTextProviderPlatform {
  readonly config: TextProviderConfig;
  readonly mode: "simulated" | "live";
  readonly adapter: CompatTextAdapter;
  readonly sdk: CompatSdkClient;
  readonly dispatcher: CompatTextDispatcher;
  readonly manifest: ProviderManifest;
}

export interface CreateCompatTextProviderOptions {
  readonly config: TextProviderConfig;
  readonly mode?: "simulated" | "live";
  readonly auth?: TextProviderAuthConfig;
  readonly httpClient?: ICompatHttpClient;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

function buildManifest(config: TextProviderConfig, nowIso: string): ProviderManifest {
  const visionModels =
    config.vendor === "xai"
      ? (["grok-4", "grok-2"] as const)
      : config.vendor === "meta"
        ? ([
            "Llama-4-Maverick-17B-128E-Instruct-FP8",
            "Llama-4-Scout-17B-16E-Instruct",
          ] as const)
        : undefined;
  const capabilities: string[] = ["text.generate", "text.chat"];
  if (visionModels) capabilities.push("vision.analyze");
  if (config.vendor === "mistral") capabilities.push("embedding.generate");
  if (config.vendor === "perplexity") capabilities.push("research.web_search");
  if (
    config.vendor === "alibaba" ||
    config.vendor === "moonshot" ||
    config.vendor === "deepseek" ||
    config.vendor === "perplexity"
  ) {
    capabilities.push("reasoning.analyze");
  }
  return buildTextProviderManifest({
    providerId: config.canonicalProviderId,
    vendor: config.vendor,
    displayName: config.vendor,
    version: config.version,
    wireModels: config.seedWireModels,
    visionWireModels: visionModels,
    capabilities,
    nowIso,
  });
}

export function createCompatTextProvider(
  options: CreateCompatTextProviderOptions
): Result<CompatTextProviderPlatform> {
  const mode = options.mode ?? (options.auth?.apiKey ? "live" : "simulated");
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  const config = options.config;

  const http: ICompatHttpClient =
    options.httpClient ??
    (mode === "live"
      ? new FetchCompatHttpClient(config, options.auth ?? {}, clockMs)
      : new SimulatedCompatHttpClient(config, clockMs));

  const manifest = buildManifest(config, nowIso());
  const adapter = new CompatTextAdapter(config, manifest, [...config.seedWireModels], {
    nowIso,
  });
  const sdk = new CompatSdkClient(config, http, options.auth ?? {}, nowIso, clockMs);
  const dispatcher = new CompatTextDispatcher(config, adapter, sdk, nowIso, clockMs);

  return success({
    config,
    mode,
    adapter,
    sdk,
    dispatcher,
    manifest,
  });
}
