/**
 * SDK registry port.
 *
 * Purpose: Own SDK wrapper registration and resolution.
 * Responsibilities: register, resolve, remove, list, describe, validate.
 * Usage: Injected into the SDK engine.
 * Future Extension: Versioned registration, aliases.
 */

import type { Result } from "../../../shared/result";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkVendor } from "../contracts/enums";
import type { SdkClientId } from "../contracts/identifiers";
import type { IProviderSdkClient } from "./client";

export interface SdkValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface SdkValidationResult {
  readonly valid: boolean;
  readonly issues: readonly SdkValidationIssue[];
}

export interface ISdkRegistry {
  register(client: IProviderSdkClient): Result<void>;
  resolve(vendor: SdkVendor): Result<IProviderSdkClient>;
  resolveById(clientId: SdkClientId): Result<IProviderSdkClient>;
  remove(vendor: SdkVendor): Result<void>;
  list(): readonly SdkVendor[];
  describe(vendor: SdkVendor): Result<SdkClientDescriptor>;
  validate(client: IProviderSdkClient): Result<SdkValidationResult>;
}
