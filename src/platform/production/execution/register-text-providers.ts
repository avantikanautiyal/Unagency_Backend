/**
 * Register executable text/reasoning providers into M9.5A runtime registry.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import { asProviderId, type ProviderId } from "../../intelligence/shared/identifiers";
import type { IModelRegistry } from "../../intelligence/model-registry/interfaces/model-registry";
import type { InMemoryProviderRuntimeRegistry } from "../../intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import { createOpenAIProvider } from "../../intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../intelligence/providers/openai/constants";
import { createAnthropicProvider } from "../../intelligence/providers/anthropic/factories/create-anthropic-provider";
import { createGeminiProvider } from "../../intelligence/providers/gemini/factories/create-gemini-provider";
import { createCohereProvider } from "../../intelligence/providers/cohere/factories/create-cohere-provider";
import { createCompatTextProvider } from "../../intelligence/providers/compat/factories/create-compat-text-provider";
import { COMPAT_TEXT_PROVIDER_CONFIGS } from "../../intelligence/providers/compat/configs/text-provider-configs";
import {
  ALL_TEXT_PROVIDER_ENV_SPECS,
  isTextProviderConfigured,
  OPENAI_TEXT_ENV,
  resolveTextProviderCredential,
  ANTHROPIC_TEXT_ENV,
  GEMINI_TEXT_ENV,
  COHERE_TEXT_ENV,
} from "./text-provider-env";
import { isEmbeddingExecutableProvider } from "../../intelligence/providers/embedding/configs/verified-embedding-provider-specs";

export interface RegisteredTextProvider {
  readonly providerId: ProviderId;
  readonly dispatcher: IProviderDispatcher;
  readonly mode: "simulated" | "live";
  readonly dispatcherSupportsStreamingProviderId?: ProviderId;
}

export interface RegisterTextProvidersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly executionMode: "live" | "openai_simulated" | string;
  readonly modelRegistry: IModelRegistry;
  readonly registry: InMemoryProviderRuntimeRegistry;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  /** Inject providers for tests (bypasses env-based creation). */
  readonly injectedProviders?: readonly RegisteredTextProvider[];
}

function filterExecutableCapabilities(
  providerId: string,
  caps: readonly string[]
): readonly string[] {
  return caps.filter(
    (c) => c !== "embedding.generate" || isEmbeddingExecutableProvider(providerId)
  );
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
  return filterExecutableCapabilities(String(providerId), Array.from(set));
}

function registerCataloguedProviders(
  modelRegistry: IModelRegistry,
  registry: InMemoryProviderRuntimeRegistry
): void {
  for (const spec of ALL_TEXT_PROVIDER_ENV_SPECS) {
    const providerId = asProviderId(spec.canonicalProviderId);
    const caps = collectProviderCapabilities(modelRegistry, providerId);
    if (caps.length > 0) {
      registry.registerCatalogued(providerId, caps);
    }
  }
}

export async function registerTextProviders(
  options: RegisterTextProvidersOptions
): Promise<Result<readonly RegisteredTextProvider[]>> {
  const env = options.env ?? process.env;
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  registerCataloguedProviders(options.modelRegistry, options.registry);

  if (options.injectedProviders) {
    for (const p of options.injectedProviders) {
      const caps = collectProviderCapabilities(options.modelRegistry, p.providerId);
      options.registry.registerExecutable({
        providerId: p.providerId,
        dispatcher: p.dispatcher,
        capabilities: caps,
        status: "available",
        dispatcherSupportsStreamingProviderId: p.dispatcherSupportsStreamingProviderId,
      });
    }
    return success(options.injectedProviders);
  }

  const registered: RegisteredTextProvider[] = [];
  const isLive = options.executionMode === "live";

  // OpenAI — always attempt in simulated mode; live requires credential
  const openaiConfigured = isLive
    ? isTextProviderConfigured(env, OPENAI_TEXT_ENV)
    : true;

  if (openaiConfigured) {
    const openai = await createOpenAIProvider({
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveTextProviderCredential(env, OPENAI_TEXT_ENV.credentialEnvVar) }
        : undefined,
      skipCertification: true,
      nowIso,
      clockMs,
    });
    if (!openai.ok) return openai;

    const providerId = asProviderId("provider.openai");
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    const withMediaCaps = new Set(caps);
    withMediaCaps.add("image.generate");
    withMediaCaps.add("audio.synthesize");
    withMediaCaps.add("audio.transcribe");
    options.registry.registerExecutable({
      providerId,
      dispatcher: openai.value.dispatcher,
      capabilities: Array.from(withMediaCaps),
      status: "available",
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
    });
    registered.push({
      providerId,
      dispatcher: openai.value.dispatcher,
      mode: openai.value.mode,
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
    });
  }

  // Anthropic
  if (isLive ? isTextProviderConfigured(env, ANTHROPIC_TEXT_ENV) : true) {
    const anthropic = createAnthropicProvider({
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveTextProviderCredential(env, ANTHROPIC_TEXT_ENV.credentialEnvVar) }
        : undefined,
      nowIso,
      clockMs,
    });
    if (!anthropic.ok) return anthropic;
    const providerId = asProviderId(ANTHROPIC_TEXT_ENV.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    options.registry.registerExecutable({
      providerId,
      dispatcher: anthropic.value.dispatcher,
      capabilities: caps,
      status: "available",
    });
    registered.push({
      providerId,
      dispatcher: anthropic.value.dispatcher,
      mode: anthropic.value.mode,
    });
  }

  // Gemini
  if (isLive ? isTextProviderConfigured(env, GEMINI_TEXT_ENV) : true) {
    const gemini = createGeminiProvider({
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveTextProviderCredential(env, GEMINI_TEXT_ENV.credentialEnvVar) }
        : undefined,
      nowIso,
      clockMs,
    });
    if (!gemini.ok) return gemini;
    const providerId = asProviderId(GEMINI_TEXT_ENV.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    options.registry.registerExecutable({
      providerId,
      dispatcher: gemini.value.dispatcher,
      capabilities: caps,
      status: "available",
    });
    registered.push({
      providerId,
      dispatcher: gemini.value.dispatcher,
      mode: gemini.value.mode,
    });
  }

  // Cohere
  if (isLive ? isTextProviderConfigured(env, COHERE_TEXT_ENV) : true) {
    const cohere = createCohereProvider({
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveTextProviderCredential(env, COHERE_TEXT_ENV.credentialEnvVar) }
        : undefined,
      nowIso,
      clockMs,
    });
    if (!cohere.ok) return cohere;
    const providerId = asProviderId(COHERE_TEXT_ENV.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    options.registry.registerExecutable({
      providerId,
      dispatcher: cohere.value.dispatcher,
      capabilities: caps,
      status: "available",
    });
    registered.push({
      providerId,
      dispatcher: cohere.value.dispatcher,
      mode: cohere.value.mode,
    });
  }

  // OpenAI-compatible providers
  for (const config of COMPAT_TEXT_PROVIDER_CONFIGS) {
    const configured = isLive
      ? isTextProviderConfigured(env, config)
      : true;
    if (!configured) continue;

    const created = createCompatTextProvider({
      config,
      mode: isLive ? "live" : "simulated",
      auth: isLive
        ? { apiKey: resolveTextProviderCredential(env, config.credentialEnvVar) }
        : undefined,
      nowIso,
      clockMs,
    });
    if (!created.ok) return created;

    const providerId = asProviderId(config.canonicalProviderId);
    const caps = collectProviderCapabilities(options.modelRegistry, providerId);
    options.registry.registerExecutable({
      providerId,
      dispatcher: created.value.dispatcher,
      capabilities: caps,
      status: "available",
    });
    registered.push({
      providerId,
      dispatcher: created.value.dispatcher,
      mode: created.value.mode,
    });
  }

  if (registered.length === 0) {
    return failure(new ValidationError("No text providers registered — configure at least one provider"));
  }

  return success(registered);
}
