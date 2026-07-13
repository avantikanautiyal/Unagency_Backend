/**
 * Default provider activator.
 *
 * Purpose: Manage activation state without provider execution.
 * Responsibilities: activate/deactivate/pause/disable.
 * Usage: Injected into integration engine.
 * Future Extension: Policy-driven activation.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderActivationRecord } from "../contracts/activation";
import type { IProviderActivator } from "../interfaces/subsystems";

export class DefaultProviderActivator implements IProviderActivator {
  private readonly records = new Map<string, ProviderActivationRecord>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  activate(providerId: ProviderId): Result<ProviderActivationRecord> {
    const now = this.nowIso();
    const record: ProviderActivationRecord = {
      providerId,
      state: "active",
      activatedAt: now,
    };
    this.records.set(String(providerId), record);
    return success(record);
  }

  deactivate(providerId: ProviderId): Result<ProviderActivationRecord> {
    const record = this.records.get(String(providerId));
    if (!record) {
      return failure(
        new NotFoundError("activation record not found", { providerId })
      );
    }
    const updated: ProviderActivationRecord = {
      ...record,
      state: "inactive",
    };
    this.records.set(String(providerId), updated);
    return success(updated);
  }

  pause(providerId: ProviderId): Result<ProviderActivationRecord> {
    const record = this.records.get(String(providerId));
    if (!record) {
      return failure(
        new NotFoundError("activation record not found", { providerId })
      );
    }
    const updated: ProviderActivationRecord = {
      ...record,
      state: "paused",
      pausedAt: this.nowIso(),
    };
    this.records.set(String(providerId), updated);
    return success(updated);
  }

  disable(
    providerId: ProviderId,
    reason?: string
  ): Result<ProviderActivationRecord> {
    const now = this.nowIso();
    const updated: ProviderActivationRecord = {
      providerId,
      state: "disabled",
      disabledAt: now,
      reason,
    };
    this.records.set(String(providerId), updated);
    return success(updated);
  }

  get(providerId: ProviderId): ProviderActivationRecord | undefined {
    return this.records.get(String(providerId));
  }
}
