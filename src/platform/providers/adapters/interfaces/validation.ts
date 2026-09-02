/**
 * Normalizer, validator, error-translator, diagnostics ports.
 *
 * Purpose: Canonicalize responses, validate manifests/adapters, classify errors.
 * Responsibilities: Provider-independent normalization + validation.
 * Usage: Injected into abstract adapters, the engine, and diagnostics.
 * Future Extension: Pluggable normalization strategies per modality.
 */

import type { Result } from "../../../core/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import type { ProviderError } from "../contracts/diagnostics";
import type { ProviderManifest } from "../contracts/provider-manifest";
import type {
  ProviderCompatibilityReport,
  ProviderHealthSummary,
} from "../contracts/lifecycle-streaming";
import type {
  ProviderNormalizationResult,
  ProviderValidationResult,
} from "../contracts/results";

export interface IResponseNormalizer {
  normalize(
    raw: ProviderWirePayload,
    request: ProviderAdapterRequest
  ): Result<ProviderNormalizationResult>;
}

export interface IProviderErrorTranslator {
  /** Normalize any error into a canonical ProviderError (classified kind). */
  normalize(
    error: unknown,
    context?: Readonly<Record<string, unknown>>
  ): ProviderError;
}

export interface FeatureRequirement {
  readonly modelId?: string;
  readonly features?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly streaming?: boolean;
}

export interface IAdapterValidator {
  validateManifest(manifest: ProviderManifest): Result<ProviderValidationResult>;
  validateManifestCompleteness(
    manifest: ProviderManifest
  ): Result<ProviderValidationResult>;
  validateAdapter(
    descriptor: ProviderAdapterDescriptor
  ): Result<ProviderValidationResult>;
  validateModelCompatibility(
    manifest: ProviderManifest,
    requirement: FeatureRequirement
  ): Result<ProviderValidationResult>;
  validateStreamingCompatibility(
    manifest: ProviderManifest,
    modelId: string
  ): Result<ProviderValidationResult>;
  validateFeatureCompatibility(
    manifest: ProviderManifest,
    features: readonly string[]
  ): Result<ProviderValidationResult>;
}

export interface IProviderDiagnostics {
  validateManifest(manifest: ProviderManifest): ProviderValidationResult;
  validateAdapter(descriptor: ProviderAdapterDescriptor): ProviderValidationResult;
  compatibilityReport(
    descriptor: ProviderAdapterDescriptor,
    requirement: FeatureRequirement
  ): ProviderCompatibilityReport;
  healthSummary(descriptor: ProviderAdapterDescriptor): ProviderHealthSummary;
}
