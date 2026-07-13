import { RegistryError } from "../../../shared/errors";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { IRegistry } from "../interfaces/registries";

interface Identifiable {
  readonly id: string;
}

/**
 * Generic in-memory registry used for all M0 registry placeholders.
 */
export class InMemoryRegistry<TDescriptor extends Identifiable>
  implements IRegistry<string, TDescriptor>
{
  private readonly items = new Map<string, TDescriptor>();

  constructor(private readonly kind: string) {}

  register(descriptor: TDescriptor): Result<void> {
    if (this.items.has(descriptor.id)) {
      return failure(
        new RegistryError(`${this.kind} already registered`, {
          id: descriptor.id,
        })
      );
    }
    this.items.set(descriptor.id, descriptor);
    return success(undefined);
  }

  get(id: string): Result<TDescriptor> {
    const item = this.items.get(id);
    if (!item) {
      return failure(
        new RegistryError(`${this.kind} not found`, { id })
      );
    }
    return success(item);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  list(): readonly TDescriptor[] {
    return Array.from(this.items.values());
  }

  unregister(id: string): Result<void> {
    if (!this.items.has(id)) {
      return failure(
        new RegistryError(`${this.kind} not found`, { id })
      );
    }
    this.items.delete(id);
    return success(undefined);
  }
}
