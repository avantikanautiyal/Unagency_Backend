/**
 * Default provider diagnostics.
 *
 * Purpose: Produce manifest/adapter validation, compatibility reports, health.
 * Responsibilities: Compose the validator into inspectable reports.
 * Usage: Injected where diagnostics are surfaced (registry, engine, tests).
 * Future Extension: Aggregated fleet health.
 */

import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderDiagnostic } from "../contracts/diagnostics";
import type {
  ProviderCompatibilityReport,
  ProviderHealthSummary,
} from "../contracts/lifecycle-streaming";
import type { ProviderValidationResult } from "../contracts/results";
import { capabilityFeatures } from "../capabilities/feature-catalog";
import { findModel } from "../models/model-helpers";
import type {
  FeatureRequirement,
  IAdapterValidator,
  IProviderDiagnostics,
} from "../interfaces/validation";
import { DefaultAdapterValidator } from "../validation/default-adapter-validator";

const HEALTHY_STATES = new Set(["ready", "degraded"]);

export class DefaultProviderDiagnostics implements IProviderDiagnostics {
  constructor(
    private readonly validator: IAdapterValidator = new DefaultAdapterValidator(),
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  validateManifest(
    manifest: ProviderAdapterDescriptor["manifest"]
  ): ProviderValidationResult {
    const result = this.validator.validateManifestCompleteness(manifest);
    return result.ok ? result.value : { valid: false, issues: [] };
  }

  validateAdapter(
    descriptor: ProviderAdapterDescriptor
  ): ProviderValidationResult {
    const result = this.validator.validateAdapter(descriptor);
    return result.ok ? result.value : { valid: false, issues: [] };
  }

  compatibilityReport(
    descriptor: ProviderAdapterDescriptor,
    requirement: FeatureRequirement
  ): ProviderCompatibilityReport {
    const manifest = descriptor.manifest;
    const issues: ProviderDiagnostic[] = [];

    const missingCapabilities = (requirement.capabilities ?? []).filter(
      (capability) => !manifest.capabilities.includes(capability)
    );

    const model = requirement.modelId
      ? findModel(manifest, requirement.modelId)
      : undefined;
    const supportedFeatures = model
      ? capabilityFeatures(model.capability)
      : descriptor.supportedFeatures;

    const unsupportedFeatures = (requirement.features ?? []).filter(
      (feature) => !supportedFeatures.includes(feature)
    );

    if (requirement.modelId && !model) {
      issues.push({
        code: "model_unknown",
        message: `model '${requirement.modelId}' not in manifest`,
        severity: "error",
        source: "diagnostics",
      });
    }
    for (const capability of missingCapabilities) {
      issues.push({
        code: "capability_missing",
        message: `capability '${capability}' not supported`,
        severity: "error",
        source: "diagnostics",
      });
    }
    for (const feature of unsupportedFeatures) {
      issues.push({
        code: "feature_unsupported",
        message: `feature '${feature}' not supported`,
        severity: "error",
        source: "diagnostics",
      });
    }
    if (requirement.streaming && !manifest.streaming.supported) {
      issues.push({
        code: "streaming_unsupported",
        message: "streaming not supported",
        severity: "error",
        source: "diagnostics",
      });
    }

    return {
      adapterId: descriptor.metadata.adapterId,
      providerId: descriptor.metadata.providerId,
      compatible:
        missingCapabilities.length === 0 &&
        unsupportedFeatures.length === 0 &&
        (requirement.modelId ? Boolean(model) : true) &&
        (!requirement.streaming || manifest.streaming.supported),
      missingCapabilities,
      unsupportedFeatures,
      issues,
    };
  }

  healthSummary(descriptor: ProviderAdapterDescriptor): ProviderHealthSummary {
    return {
      adapterId: descriptor.metadata.adapterId,
      providerId: descriptor.metadata.providerId,
      state: descriptor.lifecycleState,
      healthy: HEALTHY_STATES.has(descriptor.lifecycleState),
      checkedAt: this.nowIso(),
    };
  }
}
