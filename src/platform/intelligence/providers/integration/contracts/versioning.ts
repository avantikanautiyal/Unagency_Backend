/**
 * Provider version manifest contract.
 *
 * Purpose: Track installed vs available versions and upgrade paths.
 * Responsibilities: Version comparison without package installation.
 * Usage: Produced by IProviderVersionManager.
 * Future Extension: Semantic constraint rules.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { VersionCompatibility } from "./enums";

export interface ProviderVersionManifest {
  readonly providerId: ProviderId;
  readonly installedVersion: string;
  readonly availableVersion?: string;
  readonly compatibility: VersionCompatibility;
  readonly upgradePath?: readonly string[];
  readonly downgradePath?: readonly string[];
  readonly deprecated: boolean;
  readonly checkedAt: string;
}
