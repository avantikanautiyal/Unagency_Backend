/**
 * Research provider environment + registration.
 */

import { success, type Result } from "../../core/result";
import { asProviderId, type ProviderId } from "../../core/identifiers";
import type { IModelRegistry } from "../../model-registry/interfaces/model-registry";
import type { InMemoryProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import {
  ALL_RESEARCH_PROVIDER_SPECS,
  VERIFIED_RESEARCH_PROVIDER_SPECS,
  type VerifiedResearchProviderSpec,
} from "../../providers/research/configs/verified-research-provider-specs";
import { VendorSyncResearchDispatcher } from "../../providers/research/common/vendor-sync-research-dispatcher";
import { isProviderEnableFlagOn } from "./provider-enable-flag";

export function resolveResearchApiKey(
  env: NodeJS.ProcessEnv,
  credentialEnvVar: string
): string | undefined {
  return env[credentialEnvVar]?.trim() || undefined;
}

export function isResearchProviderExecutable(
  env: NodeJS.ProcessEnv,
  spec: VerifiedResearchProviderSpec
): boolean {
  if (!spec.vendorApiVerified) return false;
  const key = resolveResearchApiKey(env, spec.credentialEnvVar);
  return isProviderEnableFlagOn(env, spec.enableEnvVar, Boolean(key));
}

export interface RegisteredResearchProvider {
  readonly providerId: ProviderId;
  readonly dispatcher: IProviderDispatcher;
  readonly mode: "simulated" | "live";
}

export interface RegisterResearchProvidersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly executionMode: "live" | "openai_simulated" | string;
  readonly modelRegistry: IModelRegistry;
  readonly registry: InMemoryProviderRuntimeRegistry;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
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

export function registerResearchProviders(
  options: RegisterResearchProvidersOptions
): Result<readonly RegisteredResearchProvider[]> {
  const env = options.env ?? process.env;
  const isLive = options.executionMode === "live";
  const registered: RegisteredResearchProvider[] = [];

  for (const spec of ALL_RESEARCH_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    if (caps.length > 0) {
      options.registry.registerCatalogued(providerId, caps);
    }
  }

  for (const spec of VERIFIED_RESEARCH_PROVIDER_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    if (caps.length === 0) continue;

    const executable = isLive ? isResearchProviderExecutable(env, spec) : true;
    if (!executable && isLive) continue;

    const apiKey = isLive
      ? resolveResearchApiKey(env, spec.credentialEnvVar)
      : undefined;
    const dispatcher = new VendorSyncResearchDispatcher(
      spec,
      { apiKey },
      options.nowIso,
      options.clockMs
    );

    options.registry.registerExecutable({
      providerId,
      dispatcher,
      capabilities: caps,
      status: "available",
    });
    registered.push({
      providerId,
      dispatcher,
      mode: apiKey ? "live" : "simulated",
    });
  }

  return success(registered);
}
