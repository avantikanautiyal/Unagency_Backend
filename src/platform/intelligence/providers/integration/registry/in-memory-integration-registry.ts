/**
 * In-memory integration registry.
 *
 * Purpose: Store provider registration records.
 * Responsibilities: register/resolve/list/remove/update.
 * Usage: Central integration store.
 * Future Extension: Persistence adapter.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError, ProviderError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderRegistrationRecord } from "../contracts/health-registration";
import type { IntegrationId } from "../contracts/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { IProviderIntegrationRegistry } from "../interfaces/registry";

export class InMemoryIntegrationRegistry implements IProviderIntegrationRegistry {
  private readonly records = new Map<string, ProviderRegistrationRecord>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  register(
    manifest: ProviderManifest,
    integrationId: IntegrationId
  ): Result<ProviderRegistrationRecord> {
    const key = String(manifest.providerId);
    if (this.records.has(key)) {
      return failure(
        new ProviderError("provider already registered", {
          providerId: manifest.providerId,
        })
      );
    }
    const now = this.nowIso();
    const record: ProviderRegistrationRecord = {
      integrationId,
      providerId: manifest.providerId,
      vendor: manifest.vendor,
      manifest,
      lifecycleState: "registered",
      registeredAt: now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return success(record);
  }

  resolve(providerId: ProviderId): Result<ProviderRegistrationRecord> {
    const record = this.records.get(String(providerId));
    if (!record) {
      return failure(
        new NotFoundError("provider not registered", { providerId })
      );
    }
    return success(record);
  }

  resolveByIntegrationId(
    integrationId: IntegrationId
  ): Result<ProviderRegistrationRecord> {
    const record = [...this.records.values()].find(
      (r) => r.integrationId === integrationId
    );
    if (!record) {
      return failure(
        new NotFoundError("integration not found", { integrationId })
      );
    }
    return success(record);
  }

  list(): readonly ProviderRegistrationRecord[] {
    return [...this.records.values()];
  }

  remove(providerId: ProviderId): Result<void> {
    if (!this.records.delete(String(providerId))) {
      return failure(
        new NotFoundError("provider not registered", { providerId })
      );
    }
    return success(undefined);
  }

  update(
    providerId: ProviderId,
    manifest: ProviderManifest
  ): Result<ProviderRegistrationRecord> {
    const existing = this.records.get(String(providerId));
    if (!existing) {
      return failure(
        new NotFoundError("provider not registered", { providerId })
      );
    }
    const updated: ProviderRegistrationRecord = {
      ...existing,
      manifest,
      vendor: manifest.vendor,
      updatedAt: this.nowIso(),
    };
    this.records.set(String(providerId), updated);
    return success(updated);
  }

  has(providerId: ProviderId): boolean {
    return this.records.has(String(providerId));
  }

  updateLifecycle(
    providerId: ProviderId,
    lifecycleState: ProviderRegistrationRecord["lifecycleState"]
  ): Result<ProviderRegistrationRecord> {
    const existing = this.records.get(String(providerId));
    if (!existing) {
      return failure(
        new NotFoundError("provider not registered", { providerId })
      );
    }
    const updated: ProviderRegistrationRecord = {
      ...existing,
      lifecycleState,
      updatedAt: this.nowIso(),
    };
    this.records.set(String(providerId), updated);
    return success(updated);
  }
}
