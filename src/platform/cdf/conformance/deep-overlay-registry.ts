/** Registry-derived drift lock for Class-A target-resolution overlays. */

import { resolveCdfCanonicalService } from "../canonical";
import {
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_KEY_ALIASES,
  PACKAGING_PHASE_ARTIFACT_KEY,
} from "../artifacts/packaging/keys";
import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_KEY_ALIASES,
  SOCIAL_MEDIA_PHASE_ARTIFACT_KEY,
} from "../artifacts/social-media/keys";
import {
  PRESENTATION_ARTIFACT_KEYS,
} from "../artifacts/presentation/keys";
import {
  PRESENTATION_KEY_ALIASES,
  PRESENTATION_PHASE_FALLBACK,
} from "../generation-artifact/target-resolution";

type OverlayKeySet = Record<string, string>;
type OverlayPhaseMap = Record<string, string | null>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CDF deep-overlay registry drift: ${message}`);
}

function assertAliasesResolveToKnownKeys(input: {
  name: string;
  aliases: Record<string, string>;
  keys: OverlayKeySet;
}): void {
  const validKeys = new Set(Object.values(input.keys));
  for (const [alias, target] of Object.entries(input.aliases)) {
    assert(alias.trim(), `${input.name} has an empty alias`);
    assert(
      validKeys.has(target),
      `${input.name} alias ${alias} targets unknown key ${target}`,
    );
  }
}

function assertPhaseMapMatchesRegistry(input: {
  serviceId: string;
  phaseMap: OverlayPhaseMap;
  aliases: Record<string, string>;
  phaseKey: (phase: { artifact: { artifactKey: string }; presentationArtifactFamily?: string }) => string | undefined;
}): void {
  const service = resolveCdfCanonicalService(input.serviceId);
  assert(service, `missing service ${input.serviceId}`);
  for (const [phaseId, target] of Object.entries(input.phaseMap)) {
    const phase = service.phases.find((candidate) => candidate.phaseId === phaseId);
    assert(phase, `${input.serviceId}.${phaseId} is not a registry phase`);
    if (target == null) {
      assert(
        phase.generationModality === "materialize" || phase.generationModality === "none",
        `${input.serviceId}.${phaseId} has no overlay target but is generative`,
      );
      continue;
    }
    const registryKey = input.phaseKey(phase);
    assert(
      registryKey != null,
      `${input.serviceId}.${phaseId} has no registry artifact relationship`,
    );
    const resolved = input.aliases[registryKey!] ?? registryKey;
    assert(
      resolved === target,
      `${input.serviceId}.${phaseId} maps ${registryKey} to ${target}, expected ${resolved}`,
    );
  }

  for (const phase of service.phases) {
    const mapped = input.phaseMap[phase.phaseId];
    if (mapped !== undefined) continue;
    assert(
      phase.generationModality === "materialize" || phase.generationModality === "none",
      `${input.serviceId}.${phase.phaseId} is an unmapped generative registry phase`,
    );
  }
}

/** Throws on any registry/overlay service, phase, or artifact-key drift. */
export function assertDeepOverlayRegistryConformance(): void {
  assertAliasesResolveToKnownKeys({
    name: "presentation",
    aliases: PRESENTATION_KEY_ALIASES,
    keys: PRESENTATION_ARTIFACT_KEYS,
  });
  assertAliasesResolveToKnownKeys({
    name: "packaging",
    aliases: PACKAGING_KEY_ALIASES,
    keys: PACKAGING_ARTIFACT_KEYS,
  });
  assertAliasesResolveToKnownKeys({
    name: "social-media",
    aliases: SOCIAL_MEDIA_KEY_ALIASES,
    keys: SOCIAL_MEDIA_ARTIFACT_KEYS,
  });

  assertPhaseMapMatchesRegistry({
    serviceId: "presentation",
    phaseMap: PRESENTATION_PHASE_FALLBACK,
    aliases: PRESENTATION_KEY_ALIASES,
    phaseKey: (phase) => phase.presentationArtifactFamily ?? phase.artifact.artifactKey,
  });
  assertPhaseMapMatchesRegistry({
    serviceId: "packaging",
    phaseMap: PACKAGING_PHASE_ARTIFACT_KEY,
    aliases: PACKAGING_KEY_ALIASES,
    phaseKey: (phase) => phase.artifact.artifactKey,
  });
  assertPhaseMapMatchesRegistry({
    serviceId: "social-media",
    phaseMap: SOCIAL_MEDIA_PHASE_ARTIFACT_KEY,
    aliases: SOCIAL_MEDIA_KEY_ALIASES,
    phaseKey: (phase) => phase.artifact.artifactKey,
  });
}
