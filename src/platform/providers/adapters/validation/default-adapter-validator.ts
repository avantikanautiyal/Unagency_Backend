/**
 * Default adapter validator.
 *
 * Purpose: Validate manifests, adapters, and compatibility.
 * Responsibilities: manifest completeness, model/streaming/feature compatibility.
 * Usage: Injected into the registry and diagnostics.
 * Future Extension: Schema-driven manifest validation.
 */

import { success, type Result } from "../../../core/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderManifest } from "../contracts/provider-manifest";
import type {
  ProviderValidationIssue,
  ProviderValidationResult,
} from "../contracts/results";
import { capabilityFeatures } from "../capabilities/feature-catalog";
import { findModel } from "../models/model-helpers";
import type {
  FeatureRequirement,
  IAdapterValidator,
} from "../interfaces/validation";

function result(issues: readonly ProviderValidationIssue[]): ProviderValidationResult {
  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

export class DefaultAdapterValidator implements IAdapterValidator {
  validateManifest(manifest: ProviderManifest): Result<ProviderValidationResult> {
    const issues: ProviderValidationIssue[] = [];

    if (!manifest.providerId) {
      issues.push({ code: "manifest_provider_id", message: "providerId is required", severity: "error" });
    }
    if (!manifest.vendor?.trim()) {
      issues.push({ code: "manifest_vendor", message: "vendor is required", severity: "error" });
    }
    if (manifest.models.length === 0) {
      issues.push({ code: "manifest_models", message: "manifest must declare at least one model", severity: "error" });
    }
    if (manifest.modalities.length === 0) {
      issues.push({ code: "manifest_modalities", message: "manifest must declare at least one modality", severity: "error" });
    }
    if (manifest.authenticationTypes.length === 0) {
      issues.push({ code: "manifest_auth", message: "manifest must declare at least one authentication type", severity: "warning" });
    }

    return success(result(issues));
  }

  validateManifestCompleteness(
    manifest: ProviderManifest
  ): Result<ProviderValidationResult> {
    const base = this.validateManifest(manifest);
    if (!base.ok) return base;
    const issues: ProviderValidationIssue[] = [...base.value.issues];

    if (Object.keys(manifest.defaultModels).length === 0) {
      issues.push({ code: "manifest_default_models", message: "no default models declared", severity: "warning" });
    }
    if (manifest.supportedRegions.length === 0) {
      issues.push({ code: "manifest_regions", message: "no supported regions declared", severity: "info" });
    }
    const hasDefault = manifest.models.some((m) => m.isDefault);
    if (!hasDefault) {
      issues.push({ code: "manifest_no_default_model", message: "no model flagged isDefault", severity: "warning" });
    }

    return success(result(issues));
  }

  validateAdapter(
    descriptor: ProviderAdapterDescriptor
  ): Result<ProviderValidationResult> {
    const manifestResult = this.validateManifest(descriptor.manifest);
    if (!manifestResult.ok) return manifestResult;
    const issues: ProviderValidationIssue[] = [...manifestResult.value.issues];

    if (!descriptor.metadata.adapterId) {
      issues.push({ code: "adapter_id", message: "adapterId is required", severity: "error" });
    }
    if (descriptor.metadata.providerId !== descriptor.manifest.providerId) {
      issues.push({
        code: "adapter_provider_mismatch",
        message: "adapter providerId does not match manifest providerId",
        severity: "error",
      });
    }
    if (descriptor.supportedModalities.length === 0) {
      issues.push({ code: "adapter_modalities", message: "adapter declares no modalities", severity: "warning" });
    }

    return success(result(issues));
  }

  validateModelCompatibility(
    manifest: ProviderManifest,
    requirement: FeatureRequirement
  ): Result<ProviderValidationResult> {
    const issues: ProviderValidationIssue[] = [];
    const modelId = requirement.modelId;

    const model = modelId ? findModel(manifest, modelId) : undefined;
    if (modelId && !model) {
      issues.push({
        code: "model_unknown",
        message: `model '${modelId}' is not declared in the manifest`,
        severity: "error",
      });
      return success(result(issues));
    }

    const supported = model
      ? capabilityFeatures(model.capability)
      : manifest.models.flatMap((m) => capabilityFeatures(m.capability));

    for (const feature of requirement.features ?? []) {
      if (!supported.includes(feature)) {
        issues.push({
          code: "feature_unsupported",
          message: `feature '${feature}' unsupported by ${modelId ?? "manifest"}`,
          severity: "error",
          path: feature,
        });
      }
    }

    for (const capability of requirement.capabilities ?? []) {
      if (!manifest.capabilities.includes(capability)) {
        issues.push({
          code: "capability_unsupported",
          message: `capability '${capability}' not declared`,
          severity: "error",
          path: capability,
        });
      }
    }

    if (requirement.streaming && !manifest.streaming.supported) {
      issues.push({ code: "streaming_unsupported", message: "streaming requested but not supported", severity: "error" });
    }

    return success(result(issues));
  }

  validateStreamingCompatibility(
    manifest: ProviderManifest,
    modelId: string
  ): Result<ProviderValidationResult> {
    const issues: ProviderValidationIssue[] = [];
    const model = findModel(manifest, modelId);
    if (!model) {
      issues.push({ code: "model_unknown", message: `model '${modelId}' unknown`, severity: "error" });
      return success(result(issues));
    }
    if (!manifest.streaming.supported) {
      issues.push({ code: "streaming_unsupported", message: "provider does not support streaming", severity: "error" });
    } else if (!model.capability.streaming) {
      issues.push({ code: "model_streaming_unsupported", message: `model '${modelId}' does not support streaming`, severity: "error" });
    }
    return success(result(issues));
  }

  validateFeatureCompatibility(
    manifest: ProviderManifest,
    features: readonly string[]
  ): Result<ProviderValidationResult> {
    return this.validateModelCompatibility(manifest, { features });
  }
}
