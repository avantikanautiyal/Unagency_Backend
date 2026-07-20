/**
 * Template provider registry.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { AbstractProviderFactory } from "../factories/abstract-provider-factory";

export class TemplateProviderRegistry {
  private readonly factories = new Map<string, AbstractProviderFactory>();

  register(factory: AbstractProviderFactory): Result<void> {
    const id = String(factory.providerId);
    if (this.factories.has(id)) {
      return failure(new ValidationError(`provider already registered: ${id}`));
    }
    this.factories.set(id, factory);
    return success(undefined);
  }

  resolve(providerId: ProviderId): Result<AbstractProviderFactory> {
    const factory = this.factories.get(String(providerId));
    if (!factory) {
      return failure(new NotFoundError(`provider factory not found: ${providerId}`));
    }
    return success(factory);
  }

  list(): readonly ProviderId[] {
    return [...this.factories.keys()] as ProviderId[];
  }
}
