/**
 * Phase 14 — Platform CapabilityRegistry modality IDs as ActionDefinition views.
 * CapabilityRegistry remains authoritative; this is a thin discovery adapter.
 */

import type { ActionDefinition } from "./types";

/** Seeded / commonly used capability IDs from platform CapabilityRegistry. */
const CAPABILITY_IDS = [
  "text.generate",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.transcribe",
  "audio.speech",
  "embedding.generate",
  "reasoning.analyze",
  "research.search",
] as const;

export function buildCapabilityActionDefinitions(): ActionDefinition[] {
  return CAPABILITY_IDS.map((capabilityId) => ({
    actionId: `capability.${capabilityId}`,
    version: "1.0.0",
    displayName: capabilityId,
    description:
      "Platform capability modality (ICapabilityRegistry). Describes negotiation capability; never executes AI.",
    domain: "capability",
    actionType: "capability" as const,
    executionMode: "MODEL_GENERATION" as const,
    inputContract: {
      required: ["current_instruction"] as const,
      optional: [
        "multimodal_context",
        "provider_model",
        "output_contract",
      ] as const,
    },
    outputContract: { kind: "capability_definition" as const },
    requiredContext: ["current_instruction"],
    optionalContext: [
      "multimodal_context",
      "provider_model",
      "output_contract",
    ],
    authorizationRequirements: ["organization", "user_permission"],
    sideEffectLevel: "READ_ONLY" as const,
    deterministic: false,
    supportsDryRun: true,
    sourceRegistry: "platform_capability_registry" as const,
    sourceReference: `ICapabilityRegistry:${capabilityId}`,
    enabled: true,
    metadata: {
      capabilityId,
      neverExecutesAi: true,
      providerNeutral: true,
    },
  }));
}
