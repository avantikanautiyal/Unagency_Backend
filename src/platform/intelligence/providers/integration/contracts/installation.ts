/**
 * Provider installation contracts.
 *
 * Purpose: Describe an in-memory provider installation record.
 * Responsibilities: Track installation state without package installs.
 * Usage: Produced by IProviderInstaller.
 * Future Extension: Dependency resolution metadata.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { ProviderInstallationState } from "./enums";
import type { InstallationId } from "./identifiers";

export interface ProviderInstallation {
  readonly installationId: InstallationId;
  readonly providerId: ProviderId;
  readonly manifest: ProviderManifest;
  readonly state: ProviderInstallationState;
  readonly installedAt?: string;
  readonly uninstalledAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
