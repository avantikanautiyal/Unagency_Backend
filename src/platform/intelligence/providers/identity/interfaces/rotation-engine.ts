/**
 * Rotation engine port.
 *
 * Purpose: Decide and perform credential rotation (rotation logic only).
 * Responsibilities: shouldRotate policy check; rotate via the credential store.
 * Usage: Scheduled/manual/forced rotation triggers.
 * Future Extension: Secret-manager-backed rotation (no integration here).
 */

import type { Result } from "../../../shared/result";
import type { ProviderCredential } from "../contracts/credential";
import type { RotationReason } from "../contracts/enums";
import type { CredentialId } from "../contracts/identifiers";
import type { CredentialRotationResult } from "../contracts/rotation";

export interface IRotationEngine {
  shouldRotate(credential: ProviderCredential, nowMs: number): boolean;
  rotate(
    credentialId: CredentialId,
    reason: RotationReason,
    newSecret?: string
  ): Promise<Result<CredentialRotationResult>>;
}
