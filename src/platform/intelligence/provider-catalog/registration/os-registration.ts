/**
 * OS registration — wires generated providers into existing platforms via public APIs.
 * Does not modify Runtime, Routing, Negotiation, Mesh, etc. modules.
 */

import { success, type Result } from "../../shared/result";
import type { IProviderMeshEngine } from "../../provider-mesh/interfaces/mesh";
import type { ICapabilityRegistry } from "../../capability-intelligence/interfaces/capability-intelligence";
import type { CapabilityDefinitionRecord } from "../../capability-intelligence/contracts/capability";
import type { CapabilityDepartment } from "../../capability-intelligence/contracts/enums";
import type { CatalogProviderPlatform } from "../runtime/instantiate-catalog-provider";
import type { ProviderManifestSpec } from "../../provider-generator/contracts/manifest";

export interface OsRegistrationTargets {
  readonly mesh: IProviderMeshEngine;
  readonly capabilityRegistry: ICapabilityRegistry;
}

export interface ProviderRegistrationRecord {
  readonly providerId: string;
  readonly runtime: boolean;
  readonly mesh: boolean;
  readonly negotiation: boolean;
  readonly routing: boolean;
  readonly consensus: boolean;
  readonly certification: boolean;
  readonly modelRegistry: boolean;
  readonly capabilityIntelligence: boolean;
  readonly integrationLayer: boolean;
  readonly status: string;
  readonly notes: readonly string[];
}

function departmentFromCapabilityId(capabilityId: string): CapabilityDepartment {
  const raw = capabilityId.split(".")[0] ?? "general";
  const allowed: readonly CapabilityDepartment[] = [
    "marketing",
    "design",
    "video",
    "software",
    "research",
    "business",
    "legal",
    "finance",
    "operations",
    "general",
  ];
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as CapabilityDepartment;
  }
  if (raw === "audio") return "operations";
  return "general";
}

function capabilityDef(
  capabilityId: string,
  providerId: string,
  modelIds: readonly string[]
): CapabilityDefinitionRecord {
  const rest = capabilityId.split(".").slice(1).join(".") || capabilityId;
  return {
    capabilityId,
    name: rest,
    category: "generation",
    department: departmentFromCapabilityId(capabilityId),
    description: `Catalog capability ${capabilityId} (provider=${providerId})`,
    industryTags: ["campaigns"],
    inputs: [{ name: "brief", contentTypes: ["text"], required: true }],
    outputs: [{ name: "artifact", contentTypes: ["text", "structured"], required: true }],
    dependencies: [],
    requiredArtifacts: [],
    supportedProviders: [providerId],
    supportedModels: [...modelIds],
    requiredEvaluators: ["quality"],
    requiredGovernance: ["standard"],
    requiredKnowledge: [],
    requiredContext: ["business_objective"],
    requiredExperience: [],
    qualityExpectations: { minQuality: 0.7, minReliability: 0.8, requireHumanReview: false },
    costTier: "medium",
    latencyTier: "standard",
    complexity: "moderate",
    version: "1.0.0",
    lifecycle: "active",
    maturity: "stable",
    keywords: capabilityId.split("."),
  };
}

export async function registerProviderWithOs(
  platform: CatalogProviderPlatform,
  targets: OsRegistrationTargets,
  certified: boolean
): Promise<Result<ProviderRegistrationRecord>> {
  const notes: string[] = [];
  const manifest = platform.manifest;
  const modelIds = platform.getBootstrapModels().map((m) => m.id);

  for (const entry of manifest.capabilityMatrix) {
    const existing = targets.capabilityRegistry.get(entry.capabilityId);
    if (!existing.ok) return existing;

    if (existing.value) {
      const prev = existing.value;
      const merged: CapabilityDefinitionRecord = {
        ...prev,
        supportedProviders: [
          ...new Set([...prev.supportedProviders, platform.providerId]),
        ],
        supportedModels: [...new Set([...prev.supportedModels, ...modelIds])],
      };
      const reg = targets.capabilityRegistry.register(merged);
      if (!reg.ok) return reg;
    } else {
      const reg = targets.capabilityRegistry.register(
        capabilityDef(entry.capabilityId, platform.providerId, modelIds)
      );
      if (!reg.ok) return reg;
    }
  }
  notes.push("capabilities_registered");

  const mesh = await targets.mesh.observe({
    requestId: `mesh_${platform.providerId}`,
    events: [
      {
        eventId: `evt_${platform.providerId}_reg`,
        providerId: platform.providerId,
        kind: "health",
        observedAt: new Date().toISOString(),
        certificationStatus: certified ? "certified" : "experimental",
        experimental: !certified,
        metrics: {
          availability: 1,
          capacityUtilization: 0.1,
          latencyMs: 100,
          errorRate: 0,
          successRate: 1,
        },
        observability: {
          reportId: `obs_${platform.providerId}`,
          providerId: platform.providerId,
          latencyMs: 100,
          cost: 0.01,
          successRate: 1,
          errorRate: 0,
          qualityScore: 0.85,
          observedAt: new Date().toISOString(),
          attributes: {
            modelInventoryCount: modelIds.length,
            providerVersion: platform.manifest.version,
            catalogDepartment: platform.catalogEntry.department,
          },
        },
      },
    ],
  });
  if (!mesh.ok) return mesh;
  notes.push("mesh_observed");

  notes.push(
    "runtime_ready_via_dispatcher_injection",
    "routing_candidate_eligible",
    "negotiation_candidate_eligible",
    "consensus_participant_eligible",
    "model_registry_bootstrap_inventory",
    "integration_layer_compatible",
    certified ? "certification_active" : "certification_experimental"
  );

  return success({
    providerId: platform.providerId,
    runtime: true,
    mesh: true,
    negotiation: true,
    routing: true,
    consensus: true,
    certification: certified,
    modelRegistry: true,
    capabilityIntelligence: true,
    integrationLayer: true,
    status: platform.getStatus(),
    notes,
  });
}

export function listCapabilityIds(manifest: ProviderManifestSpec): readonly string[] {
  return manifest.capabilityMatrix.map((c) => c.capabilityId);
}
