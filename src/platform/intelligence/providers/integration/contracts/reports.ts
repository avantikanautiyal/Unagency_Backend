/**
 * Discovery, compatibility, and synchronization report contracts.
 *
 * Purpose: Results of manifest/registry-based discovery and validation.
 * Responsibilities: Provider-independent reports; no network discovery.
 * Usage: Produced by discovery, compatibility, and sync engines.
 * Future Extension: Regional discovery filters.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { IntegrationLifecycleState } from "./enums";
import type {
  ProviderFeatureInventory,
  ProviderModelInventory,
} from "./inventory";
import type { ProviderVersionManifest } from "./versioning";

export interface ProviderDiscoveryResult {
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly displayName: string;
  readonly lifecycleState: IntegrationLifecycleState;
  readonly models: readonly string[];
  readonly capabilities: readonly string[];
  readonly modalities: readonly string[];
  readonly features: readonly string[];
  readonly versions: readonly string[];
  readonly regions: readonly string[];
  readonly limits: Readonly<Record<string, number | undefined>>;
  readonly discoveredAt: string;
}

export interface ProviderCompatibilityIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ProviderCompatibilityReport {
  readonly providerId: ProviderId;
  readonly compatible: boolean;
  readonly issues: readonly ProviderCompatibilityIssue[];
  readonly checkedAt: string;
}

export interface ProviderSynchronizationReport {
  readonly providerId: ProviderId;
  readonly synchronized: boolean;
  readonly featureInventory: ProviderFeatureInventory;
  readonly modelInventory: ProviderModelInventory;
  readonly versionManifest: ProviderVersionManifest;
  readonly registryUpdated: boolean;
  readonly warnings: readonly string[];
  readonly synchronizedAt: string;
}
