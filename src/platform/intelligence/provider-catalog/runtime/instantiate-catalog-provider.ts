/**
 * Runtime instantiation of a generator-produced provider (catalog-driven).
 * Uses catalog bootstrap models until live discovery is enabled.
 * Does not hardcode GPT/Claude/Gemini as business targets — only bootstrap inventory.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ProviderManifestSpec } from "../../provider-generator/contracts/manifest";
import type { CatalogProviderEntry } from "../catalog/provider-catalog-seed";
import type { GeneratedProviderPackage } from "../../provider-generator/contracts/result";

export interface BootstrapModel {
  readonly id: string;
  readonly label: string;
  readonly modalities: readonly string[];
  readonly capability: {
    readonly streaming: boolean;
    readonly toolCalling: boolean;
    readonly vision: boolean;
    readonly audio: boolean;
    readonly embeddings: boolean;
    readonly reasoning: boolean;
    readonly structuredOutputs: boolean;
    readonly contextWindow?: number;
  };
}

export interface DesiredCapabilityProfile {
  readonly capabilityId?: string;
  readonly modality?: string;
  readonly requireStreaming?: boolean;
  readonly requireToolCalling?: boolean;
  readonly requireVision?: boolean;
  readonly requireAudio?: boolean;
  readonly requireReasoning?: boolean;
  readonly requireStructuredOutputs?: boolean;
  readonly minContextWindow?: number;
}

export interface ModelResolution {
  readonly selectedModelId: string;
  readonly candidates: readonly string[];
  readonly score: number;
  readonly rationale: string;
}

export type CatalogProviderStatus =
  | "experimental"
  | "active"
  | "certification_failed";

export interface CatalogProviderPlatform {
  readonly providerId: string;
  readonly displayName: string;
  readonly status: CatalogProviderStatus;
  readonly manifest: ProviderManifestSpec;
  readonly generation: GeneratedProviderPackage;
  readonly catalogEntry: CatalogProviderEntry;
  discoverModels(force?: boolean): Promise<Result<{ models: readonly BootstrapModel[]; source: "catalog_bootstrap" | "cache" }>>;
  resolveModel(profile: DesiredCapabilityProfile): Result<ModelResolution>;
  getBootstrapModels(): readonly BootstrapModel[];
  getStatus(): CatalogProviderStatus;
}

function slugModelId(providerId: string, label: string): string {
  return `${providerId}:${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function buildBootstrapModels(
  entry: CatalogProviderEntry,
  manifest: ProviderManifestSpec
): BootstrapModel[] {
  return entry.models.map((row) => ({
    id: slugModelId(entry.providerId, row.modelLabel),
    label: row.modelLabel,
    modalities: [...manifest.supportedModalities],
    capability: {
      streaming: manifest.features.streaming,
      toolCalling: manifest.features.toolCalling,
      vision: manifest.features.vision,
      audio: manifest.features.audio,
      embeddings: manifest.features.embeddings,
      reasoning: manifest.features.reasoning,
      structuredOutputs: manifest.features.structuredOutput,
      contextWindow: 128000,
    },
  }));
}

function scoreModel(model: BootstrapModel, profile: DesiredCapabilityProfile): number {
  let score = 0.5;
  if (profile.requireStreaming && model.capability.streaming) score += 0.1;
  if (profile.requireToolCalling && model.capability.toolCalling) score += 0.1;
  if (profile.requireVision && model.capability.vision) score += 0.1;
  if (profile.requireAudio && model.capability.audio) score += 0.1;
  if (profile.requireReasoning && model.capability.reasoning) score += 0.1;
  if (profile.requireStructuredOutputs && model.capability.structuredOutputs) score += 0.05;
  if (profile.modality && model.modalities.includes(profile.modality)) score += 0.1;
  if (profile.capabilityId) score += 0.05;
  return Math.min(1, score);
}

export function instantiateCatalogProvider(input: {
  readonly entry: CatalogProviderEntry;
  readonly manifest: ProviderManifestSpec;
  readonly generation: GeneratedProviderPackage;
  readonly certified: boolean;
}): CatalogProviderPlatform {
  const models = buildBootstrapModels(input.entry, input.manifest);
  let cache: BootstrapModel[] | undefined;
  let status: CatalogProviderStatus = input.certified ? "active" : "experimental";

  return {
    providerId: input.entry.providerId,
    displayName: input.entry.displayName,
    status,
    manifest: input.manifest,
    generation: input.generation,
    catalogEntry: input.entry,
    getBootstrapModels: () => models,
    getStatus: () => status,
    discoverModels: async (force = false) => {
      if (!force && cache) {
        return success({ models: cache, source: "cache" });
      }
      cache = models;
      return success({ models, source: "catalog_bootstrap" });
    },
    resolveModel: (profile) => {
      const inventory = cache ?? models;
      if (!inventory.length) {
        return failure(new ValidationError("empty inventory — discoverModels first"));
      }
      const scored = inventory
        .map((m) => ({ m, score: scoreModel(m, profile) }))
        .sort((a, b) => b.score - a.score);
      const best = scored[0]!;
      return success({
        selectedModelId: best.m.id,
        candidates: scored.slice(0, 5).map((s) => s.m.id),
        score: best.score,
        rationale: `Resolved capability=${profile.capabilityId ?? "general"} → ${best.m.id} (catalog bootstrap; live discovery preferred when enabled)`,
      });
    },
  };
}
