/**
 * Register verified async video providers into M9.5A runtime registry.
 * Unverified providers are catalogued only — never LIVE-executable.
 */

import { success, type Result } from "../../intelligence/shared/result";
import { asProviderId, type ProviderId } from "../../intelligence/shared/identifiers";
import type { IModelRegistry } from "../../intelligence/model-registry/interfaces/model-registry";
import type { InMemoryProviderRuntimeRegistry } from "../../intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import type { IAsyncProviderDispatcher } from "../../intelligence/providers/async/interfaces/async-provider-dispatcher";
import {
  ALL_VIDEO_PROVIDER_SPECS,
  VERIFIED_VIDEO_PROVIDER_SPECS,
} from "../../intelligence/providers/video/configs/verified-video-provider-specs";
import { createVerifiedVideoProvider } from "../../intelligence/providers/video/factories/create-verified-video-provider";
import type { BlobAccessService } from "../../media/blob/blob-access-service";
import {
  evaluateVideoProviderEnv,
  isVideoProviderExecutable,
  resolveVideoApiKey,
} from "./video-provider-env";
import type { VendorVideoAuthContext } from "../../intelligence/providers/video/common/vendor-video-protocol";
import type { IVideoHttpClient } from "../../intelligence/providers/video/http/video-http-client";
import type { ProviderInputBytesLoader } from "../../intelligence/providers/video/pixverse/pixverse-i2v-dispatcher";

export interface RegisteredVideoProvider {
  readonly providerId: ProviderId;
  readonly dispatcher: IAsyncProviderDispatcher;
  readonly mode: "simulated" | "live";
}

export interface RegisterVideoProvidersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly executionMode: "live" | "openai_simulated" | string;
  readonly modelRegistry: IModelRegistry;
  readonly registry: InMemoryProviderRuntimeRegistry;
  readonly blobAccess?: BlobAccessService;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly injectedProviders?: readonly RegisteredVideoProvider[];
  /** Test: inject HTTP per vendor for offline certification. */
  readonly httpClientsByVendor?: Readonly<Record<string, IVideoHttpClient>>;
  /** Test: inject input byte loaders (PixVerse I2V) per vendor. */
  readonly inputBytesLoadersByVendor?: Readonly<Record<string, ProviderInputBytesLoader>>;
}

function collectProviderCapabilities(
  modelRegistry: IModelRegistry,
  providerId: ProviderId
): readonly string[] {
  const models = modelRegistry.listModels(providerId);
  if (!models.ok) return [];
  const set = new Set<string>();
  for (const model of models.value) {
    for (const c of model.capabilities) {
      if (c.supported) set.add(c.capabilityId);
    }
  }
  return Array.from(set);
}

function registerCataloguedVideoProviders(
  modelRegistry: IModelRegistry,
  registry: InMemoryProviderRuntimeRegistry
): void {
  for (const spec of ALL_VIDEO_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(modelRegistry, providerId);
    if (caps.length > 0) {
      registry.registerCatalogued(providerId, caps);
    }
  }
}

function authFromEnv(
  env: NodeJS.ProcessEnv,
  spec: (typeof ALL_VIDEO_PROVIDER_SPECS)[number]
): VendorVideoAuthContext {
  if (spec.secretEnvVar) {
    return {
      accessKey: env[spec.accessKeyEnvVar ?? spec.credentialEnvVar]?.trim(),
      secretKey: env[spec.secretEnvVar]?.trim(),
    };
  }
  return { apiKey: resolveVideoApiKey(env, spec.credentialEnvVar) };
}

export function registerVideoProviders(
  options: RegisterVideoProvidersOptions
): Result<readonly RegisteredVideoProvider[]> {
  const env = options.env ?? process.env;
  const isLive = options.executionMode === "live";

  registerCataloguedVideoProviders(options.modelRegistry, options.registry);

  if (options.injectedProviders) {
    for (const p of options.injectedProviders) {
      const caps = collectProviderCapabilities(options.modelRegistry, p.providerId);
      options.registry.registerExecutable({
        providerId: p.providerId,
        dispatcher: p.dispatcher,
        capabilities: caps.length > 0 ? caps : ["video.generate"],
        status: "available",
      });
    }
    return success(options.injectedProviders);
  }

  const registered: RegisteredVideoProvider[] = [];

  for (const spec of VERIFIED_VIDEO_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    if (caps.length === 0) continue;

    const executable = isLive ? isVideoProviderExecutable(env, spec) : true;
    if (!executable && isLive) continue;

    const httpClient = options.httpClientsByVendor?.[spec.vendor];
    if (!isLive && !httpClient) {
      // Simulated without injected HTTP: skip executable registration
      // (tests must inject HTTP or injectedProviders). Still catalogued above.
      continue;
    }

    const platform = createVerifiedVideoProvider({
      spec,
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? authFromEnv(env, spec)
        : spec.secretEnvVar
          ? { accessKey: "simulated_ak", secretKey: "simulated_sk" }
          : { apiKey: "simulated" },
      httpClient,
      blobAccess: options.blobAccess,
      nowIso: options.nowIso,
      clockMs: options.clockMs,
      inputBytesLoader: options.inputBytesLoadersByVendor?.[spec.vendor],
    });
    if (!platform.ok) return platform;

    options.registry.registerExecutable({
      providerId,
      dispatcher: platform.value.dispatcher,
      capabilities: caps,
      status: "available",
    });

    registered.push({
      providerId,
      dispatcher: platform.value.dispatcher,
      mode: platform.value.mode,
    });
  }

  return success(registered);
}

export function evaluateVideoReadiness(env: NodeJS.ProcessEnv = process.env): {
  videoProvidersInventory: number;
  videoProvidersVerified: number;
  videoProvidersConfigured: number;
  videoProvidersExecutable: number;
  asyncMediaReady: boolean;
  providers: ReturnType<typeof evaluateVideoProviderEnv>;
} {
  const providers = evaluateVideoProviderEnv(env);
  return {
    videoProvidersInventory: providers.length,
    videoProvidersVerified: providers.filter((p) => p.verified).length,
    videoProvidersConfigured: providers.filter((p) => p.configured).length,
    videoProvidersExecutable: providers.filter((p) => p.executable).length,
    asyncMediaReady: true,
    providers,
  };
}

export function resolveAsyncVideoDispatcher(
  registry: InMemoryProviderRuntimeRegistry,
  providerId: string
): IAsyncProviderDispatcher | undefined {
  const entry = registry.resolveAvailable(asProviderId(providerId));
  if (!entry?.dispatcher) return undefined;
  const d = entry.dispatcher as IAsyncProviderDispatcher;
  if (typeof d.executionSemantics === "function" && d.executionSemantics() === "async") {
    return d;
  }
  return undefined;
}
