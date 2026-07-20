/**
 * Map catalog entries → ProviderManifestSpec for Universal Provider Generator.
 */

import type { ProviderManifestSpec, ProviderCapabilityMappingEntry, ProviderFeatureFlags } from "../../provider-generator/contracts/manifest";
import type { ProviderCategory } from "../../provider-generator/contracts/enums";
import { defaultApiKeyAuth } from "../../provider-generator/authentication/auth-schema";
import type { CatalogDepartment, CatalogProviderEntry } from "./provider-catalog-seed";

const DEPT_TO_CATEGORY: Record<CatalogDepartment, ProviderCategory> = {
  llm: "llm",
  research: "search",
  image_generation: "image",
  video_generation: "video",
  voice_generation: "speech",
  music: "music",
  audio: "audio",
  three_d: "multimodal",
};

function featuresForDepartment(dept: CatalogDepartment): ProviderFeatureFlags {
  switch (dept) {
    case "llm":
      return {
        streaming: true,
        toolCalling: true,
        structuredOutput: true,
        embeddings: false,
        vision: true,
        audio: false,
        image: false,
        video: false,
        reasoning: true,
        search: false,
      };
    case "research":
      return {
        streaming: true,
        toolCalling: false,
        structuredOutput: true,
        embeddings: false,
        vision: false,
        audio: false,
        image: false,
        video: false,
        reasoning: true,
        search: true,
      };
    case "image_generation":
      return {
        streaming: false,
        toolCalling: false,
        structuredOutput: false,
        embeddings: false,
        vision: true,
        audio: false,
        image: true,
        video: false,
        reasoning: false,
      };
    case "video_generation":
      return {
        streaming: true,
        toolCalling: false,
        structuredOutput: false,
        embeddings: false,
        vision: true,
        audio: true,
        image: false,
        video: true,
        reasoning: false,
      };
    case "voice_generation":
      return {
        streaming: true,
        toolCalling: false,
        structuredOutput: false,
        embeddings: false,
        vision: false,
        audio: true,
        image: false,
        video: false,
        reasoning: false,
      };
    case "music":
    case "audio":
      return {
        streaming: true,
        toolCalling: false,
        structuredOutput: false,
        embeddings: false,
        vision: false,
        audio: true,
        image: false,
        video: false,
        reasoning: false,
      };
    case "three_d":
      return {
        streaming: false,
        toolCalling: false,
        structuredOutput: true,
        embeddings: false,
        vision: true,
        audio: false,
        image: true,
        video: false,
        reasoning: false,
      };
    default:
      return {
        streaming: true,
        toolCalling: false,
        structuredOutput: true,
        embeddings: false,
        vision: false,
        audio: false,
        image: false,
        video: false,
        reasoning: false,
      };
  }
}

function capabilityIdsForDepartment(dept: CatalogDepartment): ProviderCapabilityMappingEntry[] {
  switch (dept) {
    case "llm":
      return [
        { capabilityId: "marketing.copywriting", modalities: ["text"], requiredFeatures: ["streaming"] },
        { capabilityId: "marketing.social.carousel", modalities: ["text"], requiredFeatures: ["reasoning"] },
        { capabilityId: "software.code_generation", modalities: ["text"], requiredFeatures: ["toolCalling", "reasoning"] },
        { capabilityId: "business.strategy", modalities: ["text"], requiredFeatures: ["reasoning"] },
      ];
    case "research":
      return [
        { capabilityId: "research.market_analysis", modalities: ["text"], requiredFeatures: ["search", "reasoning"] },
      ];
    case "image_generation":
      return [
        { capabilityId: "design.image_generation", modalities: ["image"], requiredFeatures: ["image"] },
        { capabilityId: "design.logo_creation", modalities: ["image"], requiredFeatures: ["image"] },
      ];
    case "video_generation":
      return [
        { capabilityId: "video.short_form_generation", modalities: ["video"], requiredFeatures: ["video"] },
        { capabilityId: "video.avatar_generation", modalities: ["video"], requiredFeatures: ["video"] },
      ];
    case "voice_generation":
      return [{ capabilityId: "audio.speech_generation", modalities: ["audio"], requiredFeatures: ["audio"] }];
    case "music":
      return [{ capabilityId: "audio.music_generation", modalities: ["audio"], requiredFeatures: ["audio"] }];
    case "audio":
      return [{ capabilityId: "audio.sfx_generation", modalities: ["audio"], requiredFeatures: ["audio"] }];
    case "three_d":
      return [{ capabilityId: "design.3d_generation", modalities: ["image", "structured"], requiredFeatures: ["image"] }];
    default:
      return [{ capabilityId: "general.inference", modalities: ["text"], requiredFeatures: [] }];
  }
}

function modalitiesForDepartment(dept: CatalogDepartment): string[] {
  switch (dept) {
    case "image_generation":
      return ["image"];
    case "video_generation":
      return ["video"];
    case "voice_generation":
    case "music":
    case "audio":
      return ["audio"];
    case "three_d":
      return ["image", "structured"];
    case "research":
      return ["text", "structured"];
    default:
      return ["text", "structured"];
  }
}

function mergeFeatures(
  base: ProviderFeatureFlags,
  extra: ProviderFeatureFlags
): ProviderFeatureFlags {
  return {
    streaming: base.streaming || extra.streaming,
    toolCalling: base.toolCalling || extra.toolCalling,
    structuredOutput: base.structuredOutput || extra.structuredOutput,
    vision: base.vision || extra.vision,
    audio: base.audio || extra.audio,
    image: base.image || extra.image,
    video: base.video || extra.video,
    reasoning: base.reasoning || extra.reasoning,
    embeddings: base.embeddings || extra.embeddings,
    search: Boolean(base.search || extra.search),
  };
}

export function catalogEntryToManifest(entry: CatalogProviderEntry): ProviderManifestSpec {
  const dept = entry.department;
  let features = featuresForDepartment(dept);
  for (const extra of entry.additionalDepartments ?? []) {
    features = mergeFeatures(features, featuresForDepartment(extra));
  }

  const capabilities = [
    ...capabilityIdsForDepartment(dept),
    ...(entry.additionalDepartments ?? []).flatMap((d) => capabilityIdsForDepartment(d)),
  ];
  const seen = new Set<string>();
  const capabilityMatrix = capabilities.filter((c) => {
    if (seen.has(c.capabilityId)) return false;
    seen.add(c.capabilityId);
    return true;
  });

  const modalities = [
    ...modalitiesForDepartment(dept),
    ...(entry.additionalDepartments ?? []).flatMap((d) => modalitiesForDepartment(d)),
  ];
  const modalitySet = [...new Set(modalities)];

  return {
    providerId: entry.providerId,
    displayName: entry.displayName,
    category: DEPT_TO_CATEGORY[dept],
    version: "1.0.0",
    authentication: {
      ...defaultApiKeyAuth(entry.envVarHint),
      supportsOrganization: entry.providerId === "openai",
      supportsProject: entry.providerId === "openai",
    },
    discoveryEndpoint: entry.discoveryEndpoint,
    baseUrl: entry.baseUrl,
    apiSpecification: "catalog-driven",
    supportedModalities: modalitySet,
    features,
    capabilityMatrix,
    regions: ["global"],
    metadata: {
      catalogDepartment: dept,
      additionalDepartments: entry.additionalDepartments ?? [],
      bootstrapModels: entry.models.map((m) => m.modelLabel),
      existingLeaf: entry.existingLeaf,
    },
  };
}
