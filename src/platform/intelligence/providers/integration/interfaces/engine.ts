/**
 * Integration engine, diagnostics, and health ports.
 *
 * Purpose: Public facade and observability for the integration platform.
 * Responsibilities: Orchestrate integration actions; aggregate health/diagnostics.
 * Usage: Entry point for provider integration operations.
 * Future Extension: Batch integration, webhooks.
 */

import type { Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type {
  ProviderIntegrationHealth,
  ProviderIntegrationSnapshot,
  ProviderIntegrationStatistics,
  ProviderRegistrationRecord,
} from "../contracts/health-registration";
import type {
  ProviderIntegrationRequest,
  ProviderIntegrationResult,
} from "../contracts/request-result";
import type { ProviderDiscoveryResult } from "../contracts/reports";

export interface IProviderIntegrationEngine {
  integrate(
    request: ProviderIntegrationRequest
  ): Promise<Result<ProviderIntegrationResult>>;
  discover(providerId?: ProviderId): Result<readonly ProviderDiscoveryResult[]>;
  statistics(): ProviderIntegrationStatistics;
  health(): ProviderIntegrationHealth;
  snapshot(providerId: ProviderId): Result<ProviderIntegrationSnapshot>;
}

export interface IIntegrationEventPublisher {
  publishResult(result: ProviderIntegrationResult): Promise<void>;
}

export interface MissingProviderReport {
  readonly expectedVendor?: string;
  readonly reason: string;
}

export interface ManifestInconsistency {
  readonly providerId: ProviderId;
  readonly field: string;
  readonly message: string;
}

export interface DuplicateRegistration {
  readonly providerId: ProviderId;
  readonly existingIntegrationId: string;
}

export interface VersionConflict {
  readonly providerId: ProviderId;
  readonly installed: string;
  readonly requested: string;
}

export interface IProviderIntegrationDiagnostics {
  missingProviders(): readonly MissingProviderReport[];
  manifestInconsistencies(): readonly ManifestInconsistency[];
  capabilityMismatches(): readonly string[];
  duplicateRegistrations(): readonly DuplicateRegistration[];
  versionConflicts(): readonly VersionConflict[];
  unsupportedFeatures(): readonly string[];
  registrationRecords(): readonly ProviderRegistrationRecord[];
}

export interface IProviderIntegrationHealthMonitor {
  recordRegistryCheck(ok: boolean): void;
  recordManifestCheck(ok: boolean): void;
  recordCompatibilityCheck(ok: boolean): void;
  recordSynchronizationCheck(ok: boolean): void;
  recordLifecycleCheck(ok: boolean): void;
  aggregate(): ProviderIntegrationHealth;
}
