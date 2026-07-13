/**
 * SDK diagnostics port + report contracts.
 *
 * Purpose: Inspectable SDK statistics + compatibility validation.
 * Responsibilities: Registration, config, compatibility, dependency, version reports.
 * Usage: Surfaced by the platform for observability.
 * Future Extension: Dependency graph visualization.
 */

import type { SdkVendor } from "../contracts/enums";
import type { SdkClientDescriptor, SdkCapability } from "../contracts/descriptors";
import type { SdkVersion } from "../contracts/version";

export interface SdkRegistrationReport {
  readonly vendor: SdkVendor;
  readonly registered: boolean;
  readonly clientId?: string;
  readonly version?: SdkVersion;
}

export interface SdkConfigurationReport {
  readonly vendor: SdkVendor;
  readonly configured: boolean;
  readonly authenticationPresent: boolean;
  readonly reasons: readonly string[];
}

export interface SdkCompatibilityReport {
  readonly vendor: SdkVendor;
  readonly capability: SdkCapability;
  readonly compatible: boolean;
  readonly missingFeatures: readonly string[];
}

export interface SdkDependencyReport {
  readonly vendor: SdkVendor;
  readonly sdkPackageInstalled: boolean;
  readonly transportAvailable: boolean;
  readonly adapterCompatible: boolean;
  readonly reasons: readonly string[];
}

export interface SdkVersionReport {
  readonly vendor: SdkVendor;
  readonly wrapperVersion: SdkVersion;
  readonly sdkPackageVersion?: string;
}

export interface FeatureRequirement {
  readonly streaming?: boolean;
  readonly functionCalling?: boolean;
  readonly vision?: boolean;
  readonly embeddings?: boolean;
}

export interface ISdkDiagnostics {
  registrationReport(vendor?: SdkVendor): readonly SdkRegistrationReport[];
  configurationReport(vendor: SdkVendor): SdkConfigurationReport;
  compatibilityReport(
    vendor: SdkVendor,
    requirement: FeatureRequirement
  ): SdkCompatibilityReport;
  dependencyReport(vendor: SdkVendor): SdkDependencyReport;
  versionReport(vendor: SdkVendor): SdkVersionReport | undefined;
  recordExecution(vendor: SdkVendor, latencyMs: number, ok: boolean): void;
}
