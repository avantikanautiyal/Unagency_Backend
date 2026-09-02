/**
 * In-memory provider adapter registry.
 *
 * Purpose: Own registered adapters and their lifecycle.
 * Responsibilities: register/resolve/list/describe/remove/validate.
 * Usage: The registry is the single owner of adapters.
 * Future Extension: Persistent registry adapters; multi-version adapters.
 */

import type { ProviderId } from "../../../core/identifiers";
import { failure, success, type Result } from "../../../core/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type { ProviderValidationResult } from "../contracts/results";
import {
  AdapterNotFoundError,
  AdapterRegistrationError,
} from "../errors/adapter-errors";
import type { IProviderAdapter } from "../interfaces/adapter";
import type { IProviderAdapterRegistry } from "../interfaces/engine-registry";
import type { IAdapterLifecycleManager } from "../interfaces/lifecycle-streaming";
import type { IAdapterValidator } from "../interfaces/validation";
import type { IAdapterEventPublisher } from "../interfaces/engine-registry";

export class InMemoryProviderAdapterRegistry
  implements IProviderAdapterRegistry
{
  private readonly adapters = new Map<string, IProviderAdapter>();
  private readonly byProvider = new Map<string, string>();

  constructor(
    private readonly validator: IAdapterValidator,
    private readonly lifecycle: IAdapterLifecycleManager,
    private readonly events?: IAdapterEventPublisher
  ) {}

  register(adapter: IProviderAdapter): Result<ProviderAdapterDescriptor> {
    const descriptor = adapter.describe();
    const adapterKey = String(descriptor.metadata.adapterId);

    if (this.adapters.has(adapterKey)) {
      return failure(
        new AdapterRegistrationError("adapter already registered", {
          adapterId: descriptor.metadata.adapterId,
        })
      );
    }

    const validation = this.validator.validateAdapter(descriptor);
    if (!validation.ok) {
      return validation;
    }
    if (!validation.value.valid) {
      return failure(
        new AdapterRegistrationError("adapter failed validation", {
          adapterId: descriptor.metadata.adapterId,
          issues: validation.value.issues,
        })
      );
    }

    this.adapters.set(adapterKey, adapter);
    this.byProvider.set(String(descriptor.metadata.providerId), adapterKey);
    this.lifecycle.register(descriptor.metadata.adapterId);

    void this.events?.publishRegistered(descriptor);

    return success(descriptor);
  }

  resolve(adapterId: ProviderAdapterId): Result<IProviderAdapter> {
    const adapter = this.adapters.get(String(adapterId));
    if (!adapter) {
      return failure(new AdapterNotFoundError("adapter not found", { adapterId }));
    }
    return success(adapter);
  }

  resolveByProvider(providerId: ProviderId): Result<IProviderAdapter> {
    const adapterKey = this.byProvider.get(String(providerId));
    if (!adapterKey) {
      return failure(
        new AdapterNotFoundError("no adapter registered for provider", {
          providerId,
        })
      );
    }
    const adapter = this.adapters.get(adapterKey);
    if (!adapter) {
      return failure(
        new AdapterNotFoundError("adapter not found", { providerId })
      );
    }
    return success(adapter);
  }

  describe(adapterId: ProviderAdapterId): Result<ProviderAdapterDescriptor> {
    const adapter = this.adapters.get(String(adapterId));
    if (!adapter) {
      return failure(new AdapterNotFoundError("adapter not found", { adapterId }));
    }
    const descriptor = adapter.describe();
    const state = this.lifecycle.current(adapterId) ?? descriptor.lifecycleState;
    return success({ ...descriptor, lifecycleState: state });
  }

  list(): readonly ProviderAdapterDescriptor[] {
    return [...this.adapters.values()].map((adapter) => {
      const descriptor = adapter.describe();
      const state =
        this.lifecycle.current(descriptor.metadata.adapterId) ??
        descriptor.lifecycleState;
      return { ...descriptor, lifecycleState: state };
    });
  }

  remove(adapterId: ProviderAdapterId): Result<void> {
    const key = String(adapterId);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      return failure(new AdapterNotFoundError("adapter not found", { adapterId }));
    }
    const providerId = String(adapter.describe().metadata.providerId);
    this.adapters.delete(key);
    if (this.byProvider.get(providerId) === key) {
      this.byProvider.delete(providerId);
    }
    this.lifecycle.remove(adapterId);
    return success(undefined);
  }

  validate(adapter: IProviderAdapter): Result<ProviderValidationResult> {
    return this.validator.validateAdapter(adapter.describe());
  }
}
