/**
 * Provider registry port and implementation.
 *
 * Purpose: Manage provider metadata (not execution).
 * Responsibilities: register, unregister, resolve, list, validate, healthy list.
 * Usage: Constructed with health store and optional capability matrix.
 * Future Extension: Persistent registry adapters.
 */

import type { ProviderId } from "../../core/identifiers";
import { failure, success } from "../../core/result";
import type { Result } from "../../core/result";
import { deriveCapabilityProfile } from "../capability-matrix/derive-profile";
import type { IProviderCapabilityMatrix } from "../capability-matrix/interfaces/provider-capability-matrix";
import {
  ProviderNotFoundError,
  ProviderRegistryError,
  ProviderValidationError,
} from "../errors";
import type {
  IProviderHealthStore,
  ProviderHealthStatus,
} from "../health/provider-health";
import type { ProviderDefinition } from "../metadata/provider-definition";
import { ProviderVersion } from "../versioning/provider-version";

export interface IProviderRegistry {
  registerProvider(provider: ProviderDefinition): Result<ProviderDefinition>;
  unregisterProvider(providerId: ProviderId): Result<void>;
  resolveProvider(providerId: ProviderId): Result<ProviderDefinition>;
  listProviders(): readonly ProviderDefinition[];
  providerExists(providerId: ProviderId): boolean;
  validateProvider(provider: ProviderDefinition): Result<ProviderDefinition>;
  listHealthyProviders(): readonly ProviderDefinition[];
  clear(): void;
}

const HEALTHY_STATUSES: readonly ProviderHealthStatus[] = ["healthy", "degraded"];

export class ProviderRegistry implements IProviderRegistry {
  private readonly providers = new Map<string, ProviderDefinition>();

  constructor(
    private readonly healthStore: IProviderHealthStore,
    private readonly capabilityMatrix?: IProviderCapabilityMatrix,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  validateProvider(
    provider: ProviderDefinition
  ): Result<ProviderDefinition> {
    const issues: string[] = [];

    if (!provider.id) issues.push("id is required");
    if (!provider.vendor?.trim()) issues.push("vendor is required");
    if (!provider.displayName?.trim()) issues.push("displayName is required");
    if (!ProviderVersion.tryParse(provider.version)) {
      issues.push("version must be semver major.minor.patch");
    }
    if (!provider.supportedModalities?.length) {
      issues.push("supportedModalities must be non-empty");
    }
    if (provider.timeoutLimits.defaultTimeoutMs <= 0) {
      issues.push("timeoutLimits.defaultTimeoutMs must be positive");
    }
    if (
      provider.timeoutLimits.maxTimeoutMs !== undefined &&
      provider.timeoutLimits.maxTimeoutMs < provider.timeoutLimits.defaultTimeoutMs
    ) {
      issues.push("timeoutLimits.maxTimeoutMs must be >= defaultTimeoutMs");
    }

    if (issues.length > 0) {
      return failure(
        new ProviderValidationError("Provider validation failed", {
          issues,
          providerId: provider.id,
        })
      );
    }

    return success(provider);
  }

  registerProvider(
    provider: ProviderDefinition
  ): Result<ProviderDefinition> {
    const validated = this.validateProvider(provider);
    if (!validated.ok) {
      return validated;
    }

    const id = String(provider.id);
    if (this.providers.has(id)) {
      return failure(
        new ProviderRegistryError("Provider already registered", {
          providerId: provider.id,
        })
      );
    }

    this.providers.set(id, validated.value);

    this.healthStore.set({
      providerId: provider.id,
      status: mapStatusToHealth(provider.status),
      checkedAt: this.nowIso(),
      message: "registered",
    });

    this.capabilityMatrix?.upsert(deriveCapabilityProfile(validated.value));

    return success(validated.value);
  }

  unregisterProvider(providerId: ProviderId): Result<void> {
    const id = String(providerId);
    if (!this.providers.has(id)) {
      return failure(
        new ProviderNotFoundError("Provider not found", { providerId })
      );
    }
    this.providers.delete(id);
    this.capabilityMatrix?.remove(providerId);
    return success(undefined);
  }

  resolveProvider(providerId: ProviderId): Result<ProviderDefinition> {
    const provider = this.providers.get(String(providerId));
    if (!provider) {
      return failure(
        new ProviderNotFoundError("Provider not found", { providerId })
      );
    }
    return success(provider);
  }

  listProviders(): readonly ProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  providerExists(providerId: ProviderId): boolean {
    return this.providers.has(String(providerId));
  }

  listHealthyProviders(): readonly ProviderDefinition[] {
    return this.listProviders().filter((provider) => {
      const health = this.healthStore.get(provider.id);
      if (!health) {
        return provider.status === "active";
      }
      return HEALTHY_STATUSES.includes(health.status);
    });
  }

  clear(): void {
    this.providers.clear();
    this.healthStore.clear();
    this.capabilityMatrix?.clear();
  }
}

function mapStatusToHealth(
  status: ProviderDefinition["status"]
): ProviderHealthStatus {
  switch (status) {
    case "active":
      return "healthy";
    case "degraded":
      return "degraded";
    case "maintenance":
      return "maintenance";
    case "deprecated":
      return "deprecated";
    case "offline":
    case "disabled":
      return "offline";
    default:
      return "degraded";
  }
}
