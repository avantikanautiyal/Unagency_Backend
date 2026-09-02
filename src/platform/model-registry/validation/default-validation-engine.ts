/**
 * Model validation engine.
 */

import { success, type Result } from "../../core/result";
import type { ModelManifest } from "../contracts/model";
import type { ProviderManifest } from "../contracts/provider";
import type { IModelValidationEngine } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["preview", "active", "retired"],
  preview: ["active", "retired"],
  active: ["deprecated", "retired"],
  deprecated: ["retired", "active"],
  retired: [],
};

export class DefaultModelValidationEngine implements IModelValidationEngine {
  constructor(private readonly store?: InMemoryModelRegistryStore) {}

  validateProvider(manifest: ProviderManifest): Result<readonly string[]> {
    const issues: string[] = [];
    if (!manifest.provider.displayName.trim()) issues.push("displayName required");
    if (manifest.modelIds.length === 0) issues.push("provider must reference at least one model");
    if (manifest.defaultModelId && !manifest.modelIds.includes(manifest.defaultModelId)) {
      issues.push("defaultModelId must be in modelIds");
    }
    if (manifest.capabilities.length === 0) issues.push("capabilities required");
    return success(issues);
  }

  validateModel(manifest: ModelManifest): Result<readonly string[]> {
    const issues: string[] = [];
    const m = manifest.model;
    if (!m.displayName.trim()) issues.push("displayName required");
    if (m.limits.maximumContext < 0) issues.push("maximumContext must be >= 0");
    if (m.limits.maximumOutput < 0) issues.push("maximumOutput must be >= 0");
    if (m.capabilities.length === 0) issues.push("capabilities required");
    if (m.pricing.inputPer1kTokens !== undefined && m.pricing.inputPer1kTokens < 0) {
      issues.push("input pricing must be >= 0");
    }
    if (m.regions.length === 0) issues.push("at least one region required");
    const capIds = m.capabilities.map((c) => c.capabilityId);
    const compat = m.compatibility.compatibleCapabilities;
    if (!compat.every((c) => capIds.includes(c))) {
      issues.push("compatibility capabilities must match model capabilities");
    }
    return success(issues);
  }

  validateRegistry(): Result<readonly string[]> {
    if (!this.store) return success([]);
    const issues: string[] = [];
    for (const p of this.store.listProviders()) {
      const models = this.store.listModels(p.providerId);
      if (models.length === 0) issues.push(`${p.vendor}: no models registered`);
    }
    return success(issues);
  }

  canTransition(from: string, to: string): boolean {
    return (VALID_TRANSITIONS[from] ?? []).includes(to);
  }
}
