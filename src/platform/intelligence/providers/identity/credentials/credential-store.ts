/**
 * In-memory credential store.
 *
 * Purpose: Own credential records (metadata + reference), NOT secret material.
 * Responsibilities: register/resolve/revoke/rotate/list. Delegates secret
 *   storage to ISecretProvider.
 * Usage: Injected into the identity engine and rotation engine.
 * Future Extension: Durable stores; secrets always stay behind ISecretProvider.
 */

import type { IClock, IIdGenerator } from "../../../shared/interfaces";
import { failure, isFailure, success, type Result } from "../../../shared/result";
import type {
  CredentialMetadata,
  ProviderCredential,
} from "../contracts/credential";
import { asCredentialId, type CredentialId } from "../contracts/identifiers";
import type {
  CredentialFilter,
  RegisterCredentialInput,
} from "../contracts/requests";
import { CredentialNotFoundError, SecretProviderError } from "../errors";
import type {
  ICredentialStore,
  RotateCredentialInput,
} from "../interfaces/credential-store";
import type { ISecretProvider } from "../interfaces/secret-provider";
import { DEFAULT_EXECUTION_PERMISSIONS } from "../permissions/permission-set";

export class InMemoryCredentialStore implements ICredentialStore {
  private readonly credentials = new Map<string, ProviderCredential>();

  constructor(
    private readonly secretProvider: ISecretProvider,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock
  ) {}

  async registerCredential(
    input: RegisterCredentialInput
  ): Promise<Result<ProviderCredential>> {
    const credentialId = asCredentialId(this.idGenerator.generate("cred"));
    const secretRef = this.idGenerator.generate("sref");

    const put = await this.secretProvider.putSecret(secretRef, {
      value: input.secret,
    });
    if (isFailure(put)) {
      return put;
    }

    const now = this.clock.nowIso();
    const metadata: CredentialMetadata = {
      credentialId,
      providerId: input.providerId,
      scheme: input.scheme,
      tenancy: input.tenancy,
      scope: input.scope,
      trustLevel: input.trustLevel ?? "standard",
      status: "active",
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      rotationPolicy: input.rotationPolicy,
      regionConstraint: input.regionConstraint,
      policy: input.policy,
      labels: input.labels,
    };

    const credential: ProviderCredential = {
      reference: {
        credentialId,
        providerId: input.providerId,
        scheme: input.scheme,
        secretRef,
      },
      metadata,
      permissions: input.permissions ?? DEFAULT_EXECUTION_PERMISSIONS,
    };

    this.credentials.set(credentialId, credential);
    return success(credential);
  }

  resolveCredential(credentialId: CredentialId): Result<ProviderCredential> {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return failure(
        new CredentialNotFoundError("Credential not found", { credentialId })
      );
    }
    return success(credential);
  }

  revokeCredential(credentialId: CredentialId): Result<ProviderCredential> {
    const existing = this.credentials.get(credentialId);
    if (!existing) {
      return failure(
        new CredentialNotFoundError("Credential not found", { credentialId })
      );
    }
    const revoked: ProviderCredential = {
      ...existing,
      metadata: {
        ...existing.metadata,
        status: "revoked",
        updatedAt: this.clock.nowIso(),
      },
    };
    this.credentials.set(credentialId, revoked);
    return success(revoked);
  }

  async rotateCredential(
    credentialId: CredentialId,
    input: RotateCredentialInput
  ): Promise<Result<ProviderCredential>> {
    const existing = this.credentials.get(credentialId);
    if (!existing) {
      return failure(
        new CredentialNotFoundError("Credential not found", { credentialId })
      );
    }

    let secretRef = existing.reference.secretRef;
    if (input.newSecret !== undefined) {
      const newRef = this.idGenerator.generate("sref");
      const put = await this.secretProvider.putSecret(newRef, {
        value: input.newSecret,
      });
      if (isFailure(put)) {
        return put;
      }
      // Best-effort cleanup of the previous secret material.
      await this.secretProvider.deleteSecret(existing.reference.secretRef);
      secretRef = newRef;
    } else {
      const present = await this.secretProvider.hasSecret(secretRef);
      if (isFailure(present)) {
        return present;
      }
      if (!present.value) {
        return failure(
          new SecretProviderError("Cannot rotate: secret material missing", {
            credentialId,
          })
        );
      }
    }

    const now = this.clock.nowIso();
    const rotated: ProviderCredential = {
      ...existing,
      reference: { ...existing.reference, secretRef },
      metadata: {
        ...existing.metadata,
        status: "active",
        updatedAt: now,
        rotatedAt: now,
        lastRotationReason: input.reason,
        expiresAt: input.expiresAt ?? existing.metadata.expiresAt,
      },
    };
    this.credentials.set(credentialId, rotated);
    return success(rotated);
  }

  listCredentials(filter?: CredentialFilter): readonly ProviderCredential[] {
    let items = [...this.credentials.values()];
    if (filter?.providerId !== undefined) {
      items = items.filter(
        (c) => c.reference.providerId === filter.providerId
      );
    }
    if (filter?.organizationId !== undefined) {
      items = items.filter(
        (c) => c.metadata.scope.organizationId === filter.organizationId
      );
    }
    if (filter?.workspaceId !== undefined) {
      items = items.filter(
        (c) => c.metadata.scope.workspaceId === filter.workspaceId
      );
    }
    if (filter?.status !== undefined) {
      items = items.filter((c) => c.metadata.status === filter.status);
    }
    return items;
  }
}
