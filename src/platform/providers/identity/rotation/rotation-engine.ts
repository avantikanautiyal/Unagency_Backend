/**
 * Rotation engine.
 *
 * Purpose: Decide and perform credential rotation (logic only).
 * Responsibilities: shouldRotate policy evaluation + rotate via the store.
 * Usage: Scheduled/manual/forced/expired/revoked rotation triggers.
 * Future Extension: Secret-manager-backed rotation (no integration here).
 */

import type { IClock, IIdGenerator } from "../../../core/interfaces";
import { failure, isFailure, success, type Result } from "../../../core/result";
import type { ProviderCredential } from "../contracts/credential";
import type { RotationReason } from "../contracts/enums";
import type { CredentialId } from "../contracts/identifiers";
import type { CredentialRotationResult } from "../contracts/rotation";
import { CredentialRotationError } from "../errors";
import type { ICredentialStore } from "../interfaces/credential-store";
import type { IRotationEngine } from "../interfaces/rotation-engine";

export class RotationEngine implements IRotationEngine {
  constructor(
    private readonly store: ICredentialStore,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator
  ) {}

  shouldRotate(credential: ProviderCredential, nowMs: number): boolean {
    const policy = credential.metadata.rotationPolicy;
    if (!policy || !policy.enabled) {
      return false;
    }

    if (
      policy.rotateOnExpiry &&
      credential.metadata.expiresAt !== undefined &&
      Date.parse(credential.metadata.expiresAt) <= nowMs
    ) {
      return true;
    }

    const anchorIso =
      credential.metadata.rotatedAt ?? credential.metadata.createdAt;
    const ageMs = nowMs - Date.parse(anchorIso);

    if (policy.maxAgeMs !== undefined && ageMs >= policy.maxAgeMs) {
      return true;
    }
    if (policy.intervalMs !== undefined && ageMs >= policy.intervalMs) {
      return true;
    }
    return false;
  }

  async rotate(
    credentialId: CredentialId,
    reason: RotationReason,
    newSecret?: string
  ): Promise<Result<CredentialRotationResult>> {
    const existing = this.store.resolveCredential(credentialId);
    if (isFailure(existing)) {
      return existing;
    }

    if (
      reason === "revoked" &&
      existing.value.metadata.status === "revoked"
    ) {
      return failure(
        new CredentialRotationError("Credential already revoked", {
          credentialId,
        })
      );
    }

    const previousSecretRef = existing.value.reference.secretRef;
    // Generate a synthetic new secret when the caller does not supply one
    // (placeholder — a real secret manager would mint/rotate the material).
    const secret = newSecret ?? this.idGenerator.generate("rotated-secret");

    const rotated = await this.store.rotateCredential(credentialId, {
      reason,
      newSecret: secret,
    });
    if (isFailure(rotated)) {
      return rotated;
    }

    return success({
      credentialId,
      providerId: rotated.value.reference.providerId,
      reason,
      previousSecretRef,
      newSecretRef: rotated.value.reference.secretRef,
      rotatedAt: this.clock.nowIso(),
    });
  }
}
