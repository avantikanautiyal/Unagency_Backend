/**
 * Register verified sync audio providers into M9.5A runtime registry.
 */

import { success, type Result } from "../../intelligence/shared/result";
import { asProviderId, type ProviderId } from "../../intelligence/shared/identifiers";
import type { IModelRegistry } from "../../intelligence/model-registry/interfaces/model-registry";
import type { InMemoryProviderRuntimeRegistry } from "../../intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import {
  ALL_AUDIO_PROVIDER_SPECS,
  VERIFIED_AUDIO_PROVIDER_SPECS,
} from "../../intelligence/providers/audio/configs/verified-audio-provider-specs";
import { createVerifiedAudioProvider } from "../../intelligence/providers/audio/factories/create-verified-audio-provider";
import type { IAudioHttpClient } from "../../intelligence/providers/audio/http/audio-http-client";
import {
  evaluateAudioProviderEnv,
  isAudioProviderExecutable,
  resolveAudioApiKey,
} from "./audio-provider-env";

export interface RegisteredAudioProvider {
  readonly providerId: ProviderId;
  readonly dispatcher: IProviderDispatcher;
  readonly mode: "simulated" | "live";
}

export interface RegisterAudioProvidersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly executionMode: "live" | "openai_simulated" | string;
  readonly modelRegistry: IModelRegistry;
  readonly registry: InMemoryProviderRuntimeRegistry;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly injectedProviders?: readonly RegisteredAudioProvider[];
  readonly httpClientsByVendor?: Readonly<Record<string, IAudioHttpClient>>;
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

function registerCataloguedAudioProviders(
  modelRegistry: IModelRegistry,
  registry: InMemoryProviderRuntimeRegistry
): void {
  for (const spec of ALL_AUDIO_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(modelRegistry, providerId);
    if (caps.length > 0) {
      registry.registerCatalogued(providerId, caps);
    }
  }
}

export function registerAudioProviders(
  options: RegisterAudioProvidersOptions
): Result<readonly RegisteredAudioProvider[]> {
  const env = options.env ?? process.env;
  const isLive = options.executionMode === "live";

  registerCataloguedAudioProviders(options.modelRegistry, options.registry);

  if (options.injectedProviders) {
    for (const p of options.injectedProviders) {
      const caps = collectProviderCapabilities(options.modelRegistry, p.providerId);
      options.registry.registerExecutable({
        providerId: p.providerId,
        dispatcher: p.dispatcher,
        capabilities: caps.length > 0 ? caps : ["audio.synthesize"],
        status: "available",
      });
    }
    return success(options.injectedProviders);
  }

  const registered: RegisteredAudioProvider[] = [];

  for (const spec of VERIFIED_AUDIO_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    if (caps.length === 0) continue;

    const executable = isLive ? isAudioProviderExecutable(env, spec) : true;
    if (!executable && isLive) continue;

    const httpClient = options.httpClientsByVendor?.[spec.vendor];

    const platform = createVerifiedAudioProvider({
      spec,
      mode: isLive ? "live" : "simulated",
      auth: isLive ? { apiKey: resolveAudioApiKey(env, spec.credentialEnvVar) } : { apiKey: "simulated" },
      httpClient,
      nowIso: options.nowIso,
      clockMs: options.clockMs,
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

export function evaluateAudioReadiness(env: NodeJS.ProcessEnv = process.env): {
  audioProvidersInventory: number;
  audioProvidersVerified: number;
  audioProvidersConfigured: number;
  audioProvidersExecutable: number;
  speechProvidersExecutable: number;
  musicProvidersExecutable: number;
  providers: ReturnType<typeof evaluateAudioProviderEnv>;
} {
  const providers = evaluateAudioProviderEnv(env);
  const executable = providers.filter((p) => p.executable);
  return {
    audioProvidersInventory: providers.length,
    audioProvidersVerified: providers.filter((p) => p.verified).length,
    audioProvidersConfigured: providers.filter((p) => p.configured).length,
    audioProvidersExecutable: executable.length,
    speechProvidersExecutable: executable.filter((p) => p.supportsTts || p.supportsStt).length,
    musicProvidersExecutable: 0,
    providers,
  };
}
