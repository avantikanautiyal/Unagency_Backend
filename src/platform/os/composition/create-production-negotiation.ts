/**
 * Production negotiation composition — real CapabilityRegistry + ProviderRegistry.
 * NEVER uses FakeCapabilityRegistry / testing setupNegotiation.
 */

import { CapabilityBuilder } from "../../capability-registry/implementations/capability-builder";
import { CapabilityRegistry } from "../../capability-registry/implementations/capability-registry";
import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import { ProviderCapabilityMatrix } from "../../providers/capability-matrix/implementations/provider-capability-matrix";
import type { IProviderCapabilityMatrix } from "../../providers/capability-matrix/interfaces/provider-capability-matrix";
import { InMemoryProviderHealthStore } from "../../providers/health/in-memory-provider-health-store";
import { ProviderBuilder } from "../../providers/metadata/provider-builder";
import {
  createNegotiationEngine,
  type CreateNegotiationEngineOptions,
} from "../../providers/negotiation/factories/create-negotiation-engine";
import type { IProviderNegotiationEngine } from "../../providers/negotiation/interfaces/negotiation-engine";
import { ProviderRegistry } from "../../providers/registry/provider-registry";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import { asCapabilityId, asProviderId } from "../../core/identifiers";
import type { CapabilityId, ProviderId } from "../../core/identifiers";

/** Minimal task shape for capability seeding (legacy task intelligence removed). */
export interface TaskCapabilityHint {
  readonly capabilityMap: { readonly primary?: string };
}

export const PRODUCTION_NEGOTIATION_CAPABILITIES = [
  "text.generate",
  "image.generate",
  "video.generate",
  "audio.transcribe",
  "audio.speech",
  "embedding.generate",
  "reasoning.analyze",
  "research.search",
] as const;

export const PRODUCTION_NEGOTIATION_PROVIDERS = [
  {
    id: "provider.openai",
    vendor: "openai",
    displayName: "OpenAI",
    modalities: ["text", "image", "audio"] as const,
    capabilities: [
      "text.generate",
      "image.generate",
      "audio.transcribe",
      "audio.speech",
      "embedding.generate",
      "reasoning.analyze",
    ],
  },
  {
    id: "provider.anthropic",
    vendor: "anthropic",
    displayName: "Anthropic",
    modalities: ["text"] as const,
    capabilities: ["text.generate", "reasoning.analyze"],
  },
  {
    id: "provider.gemini",
    vendor: "gemini",
    displayName: "Google Gemini",
    modalities: ["text", "image"] as const,
    capabilities: ["text.generate", "image.generate", "embedding.generate", "reasoning.analyze"],
  },
  // LIVE image leaf id used by route visual slots (distinct from provider.gemini text leaf).
  {
    id: "provider.google",
    vendor: "google",
    displayName: "Google Image",
    modalities: ["image"] as const,
    capabilities: ["image.generate"],
  },
] as const;

export interface ProductionNegotiationPlatform {
  readonly engine: IProviderNegotiationEngine;
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly providerRegistry: IProviderRegistry;
  readonly capabilityMatrix: IProviderCapabilityMatrix;
  readonly healthStore: InMemoryProviderHealthStore;
  /** Ensures a capability from task intelligence exists in the production registry. */
  readonly ensureCapabilityFromTask: (task: TaskCapabilityHint) => void;
}

export interface CreateProductionNegotiationOptions {
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  readonly engineOptions?: Partial<CreateNegotiationEngineOptions>;
}

function seedProductionCapability(
  registry: ICapabilityRegistry,
  capabilityId: string,
  providerIds: readonly ProviderId[],
  nowIso: () => string
): void {
  if (registry.exists(asCapabilityId(capabilityId))) return;
  const modalities =
    capabilityId.startsWith("image.")
      ? (["image"] as const)
      : capabilityId.startsWith("video.")
        ? (["video"] as const)
        : capabilityId.startsWith("audio.")
          ? (["audio"] as const)
          : capabilityId.startsWith("embedding.")
            ? (["embedding"] as const)
            : (["text"] as const);

  const built = CapabilityBuilder.create(nowIso)
    .withId(capabilityId)
    .withName(capabilityId)
    .withVersion("1.0.0")
    .withDisplayName(capabilityId)
    .withDescription(`Production capability: ${capabilityId}`)
    .withCategory("production", "os")
    .withTags("production")
    .withOwner("platform")
    .withStatus("published")
    .withVisibility("public")
    .withModalities(...modalities)
    .withInputSchema({ contentTypes: ["application/json", "text/plain"] })
    .withOutputSchema({ contentTypes: ["application/json", "text/plain"] })
    .withProviderCompatibility({ compatibleProviderIds: [...providerIds] })
    .withDefaultProvider(providerIds[0]!)
    .withTimeout(120_000)
    .withRetryPolicy({ maxAttempts: 2, backoffMs: 250, strategy: "fixed" })
    .build();

  const registered = registry.register(built);
  if (!registered.ok) {
    throw new Error(
      `Failed to seed production capability ${capabilityId}: ${registered.error.message}`
    );
  }
}

function seedProductionProvider(
  registry: IProviderRegistry,
  matrix: IProviderCapabilityMatrix,
  health: InMemoryProviderHealthStore,
  spec: (typeof PRODUCTION_NEGOTIATION_PROVIDERS)[number],
  nowIso: () => string
): void {
  const providerId = asProviderId(spec.id);
  if (registry.providerExists(providerId)) return;

  const built = ProviderBuilder.create(nowIso)
    .withId(spec.id)
    .withVendor(spec.vendor)
    .withDisplayName(spec.displayName)
    .withVersion("1.0.0")
    .withStatus("active")
    .withModalities(...spec.modalities)
    .withCapabilities(...spec.capabilities)
    .withRegions("us-east-1", "global")
    .withAuthenticationType("api_key")
    .withPricingModel("token")
    .withTimeoutLimits({ defaultTimeoutMs: 60_000, maxTimeoutMs: 300_000 })
    .withStreamingSupport(true)
    .withFunctionCallingSupport(true)
    .withVisionSupport(spec.modalities.includes("image" as never))
    .withImageSupport(spec.modalities.includes("image" as never))
    .withAudioSupport(spec.modalities.includes("audio" as never))
    .withEmbeddingsSupport(
      (spec.capabilities as readonly string[]).includes("embedding.generate")
    )
    .build();

  const registered = registry.registerProvider(built);
  if (!registered.ok) {
    throw new Error(
      `Failed to seed production provider ${spec.id}: ${registered.error.message}`
    );
  }

  matrix.upsert({
    providerId,
    features: {
      supportsText: (spec.modalities as readonly string[]).includes("text"),
      supportsImage: (spec.modalities as readonly string[]).includes("image"),
      supportsVideo: false,
      supportsEmbeddings: (spec.capabilities as readonly string[]).includes(
        "embedding.generate"
      ),
      supportsModeration: false,
      supportsStreaming: true,
      supportsVision: (spec.modalities as readonly string[]).includes("image"),
      supportsAudio: (spec.modalities as readonly string[]).includes("audio"),
      supportsFunctionCalling: true,
    },
    modalities: [...spec.modalities],
    maxContextTokens: 128000,
    attributes: { supportsReasoning: true, supportsJsonMode: true },
  });

  health.set({
    providerId,
    status: "healthy",
    checkedAt: nowIso(),
    message: "production seed",
  });
}

/**
 * Seeds provider metadata + health into an existing registry (gateway planning).
 * LIVE dispatch still uses providerRuntimeRegistry; this is metadata-only.
 */
export function seedProductionProvidersIntoRegistry(
  providerRegistry: IProviderRegistry,
  capabilityMatrix: IProviderCapabilityMatrix,
  healthStore: InMemoryProviderHealthStore,
  nowIso: () => string = () => new Date().toISOString()
): void {
  for (const p of PRODUCTION_NEGOTIATION_PROVIDERS) {
    seedProductionProvider(
      providerRegistry,
      capabilityMatrix,
      healthStore,
      p,
      nowIso
    );
  }
}

/**
 * Creates negotiation engine backed by real registries (not testing fakes).
 */
export function createProductionNegotiationPlatform(
  options: CreateProductionNegotiationOptions = {}
): ProductionNegotiationPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}_${Date.now()}`);

  const capabilityRegistry = new CapabilityRegistry();
  const healthStore = new InMemoryProviderHealthStore();
  const capabilityMatrix = new ProviderCapabilityMatrix();
  const providerRegistry = new ProviderRegistry(healthStore, capabilityMatrix, nowIso);

  for (const p of PRODUCTION_NEGOTIATION_PROVIDERS) {
    seedProductionProvider(providerRegistry, capabilityMatrix, healthStore, p, nowIso);
  }

  const allProviderIds = PRODUCTION_NEGOTIATION_PROVIDERS.map((p) =>
    asProviderId(p.id)
  );
  for (const cap of PRODUCTION_NEGOTIATION_CAPABILITIES) {
    const providersForCap = PRODUCTION_NEGOTIATION_PROVIDERS.filter((p) =>
      (p.capabilities as readonly string[]).includes(cap)
    ).map((p) => asProviderId(p.id));
    seedProductionCapability(
      capabilityRegistry,
      cap,
      providersForCap.length ? providersForCap : allProviderIds,
      nowIso
    );
  }

  const engine = createNegotiationEngine({
    capabilityRegistry,
    providerRegistry,
    capabilityMatrix,
    healthStore,
    nowIso,
    createId,
    profile: {
      allowExperimentalCapabilities: true,
      allowDegradedProviders: true,
      requireHealthyProvider: false,
      requireIdentityValidation: false,
      minConfidence: 0,
    },
    ...options.engineOptions,
  });

  const ensureCapabilityFromTask = (task: TaskCapabilityHint): void => {
    const primary = String(task.capabilityMap.primary ?? "").trim();
    if (!primary) return;
    const id = asCapabilityId(primary);
    if (capabilityRegistry.exists(id)) return;
    seedProductionCapability(capabilityRegistry, primary, allProviderIds, nowIso);
  };

  return {
    engine,
    capabilityRegistry,
    providerRegistry,
    capabilityMatrix,
    healthStore,
    ensureCapabilityFromTask,
  };
}

export function isFakeCapabilityRegistry(registry: unknown): boolean {
  if (!registry || typeof registry !== "object") return false;
  if (
    (registry as { __unagencyTestFake?: boolean }).__unagencyTestFake === true
  ) {
    return true;
  }
  return (
    (registry as { constructor?: { name?: string } }).constructor?.name ===
    "FakeCapabilityRegistry"
  );
}
