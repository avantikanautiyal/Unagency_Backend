/**
 * In-memory module registry.
 *
 * Purpose: Store and validate intelligence module descriptors for the kernel.
 * Responsibilities: register, unregister, has, resolve, list, validate, clear.
 * Usage: Constructed by CompositionRoot; used by PlatformKernel.
 * Future Extension: Persistent backing store.
 */

import { RegistryError } from "../../../shared/errors";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { ModuleDescriptor } from "../contracts/descriptors";
import type {
  IModuleRegistry,
  ModuleValidationIssue,
  ModuleValidationReport,
} from "../interfaces/registries";

export class ModuleRegistry implements IModuleRegistry {
  private readonly items = new Map<string, ModuleDescriptor>();

  register(descriptor: ModuleDescriptor): Result<void> {
    const id = String(descriptor.id);
    if (this.items.has(id)) {
      return failure(
        new RegistryError("module already registered", { id })
      );
    }
    this.items.set(id, descriptor);
    return success(undefined);
  }

  unregister(id: string): Result<void> {
    if (!this.items.has(id)) {
      return failure(new RegistryError("module not found", { id }));
    }
    this.items.delete(id);
    return success(undefined);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): Result<ModuleDescriptor> {
    return this.resolve(id);
  }

  resolve(id: string): Result<ModuleDescriptor> {
    const item = this.items.get(id);
    if (!item) {
      return failure(new RegistryError("module not found", { id }));
    }
    return success(item);
  }

  list(): readonly ModuleDescriptor[] {
    return Array.from(this.items.values());
  }

  validate(): Result<ModuleValidationReport> {
    const issues: ModuleValidationIssue[] = [];

    for (const module of this.items.values()) {
      const moduleId = String(module.id);
      const dependencies = module.dependencies ?? [];

      for (const dependency of dependencies) {
        const depId = String(dependency);
        if (!this.items.has(depId)) {
          issues.push({
            moduleId,
            message: `Missing dependency: ${depId}`,
          });
        }
      }

      const cycle = this.findCycle(moduleId, new Set());
      if (cycle) {
        issues.push({
          moduleId,
          message: `Circular dependency: ${cycle.join(" -> ")}`,
        });
      }
    }

    return success({
      valid: issues.length === 0,
      issues,
    });
  }

  clear(): void {
    this.items.clear();
  }

  private findCycle(
    moduleId: string,
    visiting: Set<string>
  ): string[] | undefined {
    if (visiting.has(moduleId)) {
      return [...visiting, moduleId];
    }

    const module = this.items.get(moduleId);
    if (!module) {
      return undefined;
    }

    visiting.add(moduleId);
    for (const dependency of module.dependencies ?? []) {
      const depId = String(dependency);
      const cycle = this.findCycle(depId, visiting);
      if (cycle) {
        return cycle;
      }
    }
    visiting.delete(moduleId);
    return undefined;
  }
}
