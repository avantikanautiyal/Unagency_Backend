/**
 * Integration request and result contracts.
 *
 * Purpose: The public input/output of IProviderIntegrationEngine.
 * Responsibilities: Carry manifest + action; return integration outcome.
 * Usage: Entry point for all integration operations.
 * Future Extension: Batch integration requests.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { IntegrationAction, IntegrationLifecycleState } from "./enums";
import type { IntegrationId } from "./identifiers";
import type { ProviderActivationRecord } from "./activation";
import type { ProviderInstallation } from "./installation";
import type { ProviderIntegrationHealth, ProviderIntegrationStatistics } from "./health-registration";
import type {
  ProviderCompatibilityReport,
  ProviderDiscoveryResult,
  ProviderSynchronizationReport,
} from "./reports";
import type { ProviderVersionManifest } from "./versioning";

export interface ProviderIntegrationRequest {
  readonly requestId: string;
  readonly action: IntegrationAction;
  readonly providerId: ProviderId;
  readonly manifest: ProviderManifest;
  readonly targetVersion?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ProviderIntegrationResult {
  readonly requestId: string;
  readonly integrationId: IntegrationId;
  readonly providerId: ProviderId;
  readonly action: IntegrationAction;
  readonly success: boolean;
  readonly lifecycleState: IntegrationLifecycleState;
  readonly installation?: ProviderInstallation;
  readonly activation?: ProviderActivationRecord;
  readonly discovery?: ProviderDiscoveryResult;
  readonly compatibility?: ProviderCompatibilityReport;
  readonly synchronization?: ProviderSynchronizationReport;
  readonly versionManifest?: ProviderVersionManifest;
  readonly health: ProviderIntegrationHealth;
  readonly statistics: ProviderIntegrationStatistics;
  readonly warnings: readonly string[];
  readonly completedAt: string;
}
