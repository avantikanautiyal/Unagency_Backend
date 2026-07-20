/**
 * Capability coverage and mapping helpers.
 */

import type { IntegratedProviderRecord } from "../../../intelligence/provider-catalog/integration/catalog-integration-engine";
import type {
  CapabilityMappingRow,
  CapabilityProviderCoverage,
  CertificationRow,
  DiscoveryRecord,
  ModelInventoryRow,
} from "../contracts";

export function buildDiscoveries(
  integrated: readonly IntegratedProviderRecord[]
): DiscoveryRecord[] {
  return integrated.map((rec) => {
    const models = rec.platform.getBootstrapModels();
    return {
      providerId: rec.entry.providerId,
      modelCount: models.length,
      source: "catalog_bootstrap",
      discoveryEndpoint: rec.entry.discoveryEndpoint,
      authScheme: rec.platform.manifest.authentication.type,
      secretEnvHint: rec.entry.envVarHint,
      ok: models.length > 0,
      notes: [
        "dynamic_model_discovery_bootstrap",
        "live_discovery_ready_when_api_enabled",
        `artifacts:${rec.generationPackage.files.length}`,
      ],
    };
  });
}

export function buildModelInventory(
  integrated: readonly IntegratedProviderRecord[]
): ModelInventoryRow[] {
  const rows: ModelInventoryRow[] = [];
  for (const rec of integrated) {
    for (const m of rec.platform.getBootstrapModels()) {
      rows.push({
        providerId: rec.entry.providerId,
        modelId: m.id,
        modelLabel: m.label,
        modalities: m.modalities,
        discoverySource: "catalog_bootstrap",
        department: rec.entry.department,
      });
    }
  }
  return rows;
}

export function buildCapabilityMappings(
  integrated: readonly IntegratedProviderRecord[]
): CapabilityMappingRow[] {
  const rows: CapabilityMappingRow[] = [];
  for (const rec of integrated) {
    const f = rec.platform.manifest.features;
    for (const cap of rec.platform.manifest.capabilityMatrix) {
      rows.push({
        providerId: rec.entry.providerId,
        capabilityId: cap.capabilityId,
        modalities: cap.modalities,
        features: {
          streaming: f.streaming,
          toolCalling: f.toolCalling,
          structuredOutput: f.structuredOutput,
          vision: f.vision,
          audio: f.audio,
          image: f.image,
          video: f.video,
          reasoning: f.reasoning,
          search: Boolean(f.search),
          embeddings: f.embeddings,
        },
      });
    }
  }
  return rows;
}

export function buildCapabilityCoverage(
  mappings: readonly CapabilityMappingRow[],
  inventory: readonly ModelInventoryRow[]
): CapabilityProviderCoverage[] {
  const byCap = new Map<string, Set<string>>();
  for (const m of mappings) {
    const set = byCap.get(m.capabilityId) ?? new Set();
    set.add(m.providerId);
    byCap.set(m.capabilityId, set);
  }

  return [...byCap.entries()].map(([capabilityId, providers]) => {
    const providerIds = [...providers].sort();
    const modelIds = inventory
      .filter((i) => providerIds.includes(i.providerId))
      .map((i) => i.modelId);
    return {
      capabilityId,
      providerIds,
      modelIds,
      multiProviderEligible: providerIds.length >= 2,
    };
  });
}

export function buildCertifications(
  integrated: readonly IntegratedProviderRecord[]
): CertificationRow[] {
  return integrated.map((rec) => ({
    providerId: rec.entry.providerId,
    certified: rec.certified,
    notes: rec.certificationNotes,
    checklistItems: rec.generationPackage.certificationChecklist,
  }));
}
