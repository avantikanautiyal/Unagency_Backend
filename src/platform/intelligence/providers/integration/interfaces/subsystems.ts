/**
 * Installer, activator, discovery, sync, compatibility, lifecycle, versioning ports.
 *
 * Purpose: Subsystem interfaces for integration operations.
 * Responsibilities: Install/activate/discover/sync without execution.
 * Usage: Injected into the integration engine.
 * Future Extension: Scheduled sync, policy-driven activation.
 */

import type { Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderActivationRecord } from "../contracts/activation";
import type { IntegrationLifecycleState } from "../contracts/enums";
import type { ProviderInstallation } from "../contracts/installation";
import type {
  ProviderCompatibilityReport,
  ProviderDiscoveryResult,
  ProviderSynchronizationReport,
} from "../contracts/reports";
import type { ProviderVersionManifest } from "../contracts/versioning";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";

export interface IProviderInstaller {
  install(manifest: ProviderManifest): Result<ProviderInstallation>;
  uninstall(providerId: ProviderId): Result<ProviderInstallation>;
  get(providerId: ProviderId): ProviderInstallation | undefined;
  list(): readonly ProviderInstallation[];
}

export interface IProviderActivator {
  activate(providerId: ProviderId): Result<ProviderActivationRecord>;
  deactivate(providerId: ProviderId): Result<ProviderActivationRecord>;
  pause(providerId: ProviderId): Result<ProviderActivationRecord>;
  disable(providerId: ProviderId, reason?: string): Result<ProviderActivationRecord>;
  get(providerId: ProviderId): ProviderActivationRecord | undefined;
}

export interface IProviderDiscoveryEngine {
  discover(providerId: ProviderId): Result<ProviderDiscoveryResult>;
  discoverAll(): Result<readonly ProviderDiscoveryResult[]>;
}

export interface IProviderSynchronizationEngine {
  synchronize(
    providerId: ProviderId,
    manifest: ProviderManifest
  ): Result<ProviderSynchronizationReport>;
}

export interface IProviderCompatibilityEngine {
  validate(
    manifest: ProviderManifest,
    existing?: ProviderManifest
  ): Result<ProviderCompatibilityReport>;
}

export interface IProviderLifecycleManager {
  getState(providerId: ProviderId): IntegrationLifecycleState | undefined;
  transition(
    providerId: ProviderId,
    to: IntegrationLifecycleState
  ): Result<IntegrationLifecycleState>;
  canTransition(
    providerId: ProviderId,
    to: IntegrationLifecycleState
  ): boolean;
}

export interface IProviderVersionManager {
  track(
    providerId: ProviderId,
    installedVersion: string,
    availableVersion?: string
  ): Result<ProviderVersionManifest>;
  compare(
    installed: string,
    available: string
  ): Result<ProviderVersionManifest>;
  deprecate(providerId: ProviderId): Result<ProviderVersionManifest>;
  get(providerId: ProviderId): ProviderVersionManifest | undefined;
}
