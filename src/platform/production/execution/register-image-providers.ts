/**
 * Register verified sync image providers into M9.5A runtime registry.
 */

import { success, type Result } from "../../core/result";
import { asProviderId, type ProviderId } from "../../core/identifiers";
import type { IModelRegistry } from "../../model-registry/interfaces/model-registry";
import type { InMemoryProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import {
  ALL_IMAGE_PROVIDER_SPECS,
  VERIFIED_IMAGE_PROVIDER_SPECS,
} from "../../providers/image/configs/verified-image-provider-specs";
import { createVerifiedImageProvider } from "../../providers/image/factories/create-verified-image-provider";
import type { IImageHttpClient } from "../../providers/image/http/image-http-client";
import {
  isImageProviderExecutable,
  resolveImageApiKey,
} from "./image-provider-env";

export interface RegisteredImageProvider {
  readonly providerId: ProviderId;
  readonly dispatcher: IProviderDispatcher;
  readonly mode: "simulated" | "live";
}

export interface RegisterImageProvidersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly executionMode: "live" | "openai_simulated" | string;
  readonly modelRegistry: IModelRegistry;
  readonly registry: InMemoryProviderRuntimeRegistry;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly injectedProviders?: readonly RegisteredImageProvider[];
  readonly httpClientsByVendor?: Readonly<Record<string, IImageHttpClient>>;
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

function registerCataloguedImageProviders(
  modelRegistry: IModelRegistry,
  registry: InMemoryProviderRuntimeRegistry
): void {
  for (const spec of ALL_IMAGE_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(modelRegistry, providerId);
    if (caps.length > 0) {
      registry.registerCatalogued(providerId, caps);
    }
  }
}

export function registerImageProviders(
  options: RegisterImageProvidersOptions
): Result<readonly RegisteredImageProvider[]> {
  const env = options.env ?? process.env;
  const isLive = options.executionMode === "live";

  registerCataloguedImageProviders(options.modelRegistry, options.registry);

  if (options.injectedProviders) {
    for (const p of options.injectedProviders) {
      const caps = collectProviderCapabilities(options.modelRegistry, p.providerId);
      options.registry.registerExecutable({
        providerId: p.providerId,
        dispatcher: p.dispatcher,
        capabilities: caps.length > 0 ? caps : ["image.generate"],
        status: "available",
      });
    }
    return success(options.injectedProviders);
  }

  const registered: RegisteredImageProvider[] = [];

  for (const spec of VERIFIED_IMAGE_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    if (caps.length === 0) continue;

    const executable = isLive ? isImageProviderExecutable(env, spec) : true;
    if (!executable && isLive) continue;

    const httpClient = options.httpClientsByVendor?.[spec.vendor];
    const platform = createVerifiedImageProvider({
      spec,
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveImageApiKey(env, spec.credentialEnvVar) }
        : undefined,
      httpClient,
      nowIso: options.nowIso,
      clockMs: options.clockMs,
    });
    if (!platform.ok) continue;

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
