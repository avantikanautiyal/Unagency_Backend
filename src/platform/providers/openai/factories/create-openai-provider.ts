/**
 * OpenAI provider platform factory — composes frozen layers without modifying them.
 */

import { success, type Result } from "../../../core/result";
import { createAdapterPlatform, type AdapterPlatform } from "../../adapters/factories/create-adapter-platform";
import { createProviderRuntime } from "../../runtime/factories/create-provider-runtime";
import type { IProviderRuntime } from "../../runtime/interfaces/provider-runtime";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import { SimulatedOpenAIHttpClient } from "../sdk/simulated-http-client";
import { FetchOpenAIHttpClient, type IOpenAIHttpClient } from "../sdk/openai-http-client";
import { OpenAISdkClient } from "../sdk/openai-sdk-client";
import { OpenAIModelDiscovery } from "../discovery/model-discovery";
import { OpenAIModelResolver } from "../models/model-resolver";
import { buildManifestFromDiscovery } from "../models/manifest-from-discovery";
import { OpenAIProviderAdapter } from "../adapters/openai-adapter";
import { OpenAIDispatcher } from "../dispatcher/openai-dispatcher";
import { ensureOpenAIImageModels, enrichDiscoveredModel } from "../capabilities/capability-enricher";
import type {
  DesiredCapabilityProfile,
  DiscoveredOpenAIModel,
  OpenAIAuthenticationConfig,
  OpenAIModelDiscoveryResult,
  OpenAIModelResolution,
  OpenAIProviderStatus,
} from "../contracts/openai-contracts";
import { OPENAI_PROVIDER_VERSION } from "../constants";

export interface OpenAIProviderPlatform {
  readonly status: OpenAIProviderStatus;
  readonly mode: "simulated" | "live";
  readonly adapter: OpenAIProviderAdapter;
  readonly sdk: OpenAISdkClient;
  readonly dispatcher: OpenAIDispatcher;
  readonly discovery: OpenAIModelDiscovery;
  readonly resolver: OpenAIModelResolver;
  readonly manifest: ProviderManifest;
  readonly adapterPlatform: AdapterPlatform;
  readonly runtime: IProviderRuntime;
  readonly version: string;
  discoverModels(force?: boolean): Promise<Result<OpenAIModelDiscoveryResult>>;
  resolveModel(profile: DesiredCapabilityProfile): Result<OpenAIModelResolution>;
  getStatus(): OpenAIProviderStatus;
}

export interface CreateOpenAIProviderOptions {
  readonly mode?: "simulated" | "live";
  readonly auth?: OpenAIAuthenticationConfig;
  readonly httpClient?: IOpenAIHttpClient;
  /** @deprecated Provider certification removed; option is ignored. */
  readonly skipCertification?: boolean;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export async function createOpenAIProvider(
  options: CreateOpenAIProviderOptions = {}
): Promise<Result<OpenAIProviderPlatform>> {
  const mode = options.mode ?? (options.auth?.apiKey ? "live" : "simulated");
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let idSeq = 0;
  const createId =
    options.createId ??
    ((p) => `${p}_${++idSeq}_${clockMs()}`);

  const http: IOpenAIHttpClient =
    options.httpClient ??
    (mode === "live"
      ? new FetchOpenAIHttpClient(options.auth ?? {}, clockMs)
      : new SimulatedOpenAIHttpClient(clockMs));

  const discovery = new OpenAIModelDiscovery(http, nowIso, clockMs);
  if (mode === "simulated") discovery.markSource("simulated");

  const discovered = await discovery.discover(true);
  const resolver = new OpenAIModelResolver(nowIso);
  let inventoryModels: DiscoveredOpenAIModel[];
  if (!discovered.ok) {
    // Transient vendor outages (e.g. Cloudflare 522) must not block API boot —
    // seed chat + image models so LIVE dispatch can retry when the vendor recovers.
    console.warn(
      `⚠️  [Direct] OpenAI discovery failed (${discovered.error.message}) — using seeded inventory`
    );
    inventoryModels = ensureOpenAIImageModels([
      enrichDiscoveredModel({ id: "gpt-4o", owned_by: "openai" }),
      enrichDiscoveredModel({ id: "gpt-4o-mini", owned_by: "openai" }),
      enrichDiscoveredModel({ id: "gpt-4.1", owned_by: "openai" }),
      enrichDiscoveredModel({ id: "gpt-4.1-mini", owned_by: "openai" }),
    ]);
    discovery.seedCache(inventoryModels, mode === "live" ? "cache" : "simulated");
  } else {
    inventoryModels = ensureOpenAIImageModels(discovered.value.models);
    // Keep discovery cache aligned with seeded image models for translateRequest lookups.
    discovery.seedCache(inventoryModels, discovered.value.source);
  }

  const manifest = buildManifestFromDiscovery(inventoryModels, {
    status: "registered",
    maturity: "experimental",
    nowIso: nowIso(),
  });
  const status: OpenAIProviderStatus = "experimental";

  const adapter = new OpenAIProviderAdapter(manifest, discovery, resolver, { nowIso });
  const sdk = new OpenAISdkClient(http, options.auth ?? {}, nowIso, clockMs);
  const dispatcher = new OpenAIDispatcher(adapter, sdk, nowIso, clockMs);

  const adapterPlatform = createAdapterPlatform({ nowIso, createId });
  const registered = adapterPlatform.registry.register(adapter);
  if (!registered.ok) return registered;

  const runtime = createProviderRuntime({
    dispatcher,
    nowIso,
    nowMs: clockMs,
    createId,
  });

  let currentStatus = status;

  const platform: OpenAIProviderPlatform = {
    get status() {
      return currentStatus;
    },
    mode,
    adapter,
    sdk,
    dispatcher,
    discovery,
    resolver,
    manifest,
    adapterPlatform,
    runtime,
    version: OPENAI_PROVIDER_VERSION,
    async discoverModels(force = false) {
      return discovery.discover(force);
    },
    resolveModel(profile) {
      return resolver.resolve(profile, discovery.getCached());
    },
    getStatus() {
      return currentStatus;
    },
  };

  return success(platform);
}
