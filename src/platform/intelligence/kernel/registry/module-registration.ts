/**
 * Kernel-level module registration helpers.
 * Uses the platform module registry; does not implement capability/provider logic.
 */

import type { Result } from "../../shared/result";
import type { ModuleDescriptor } from "./contracts/descriptors";
import type { IModuleRegistry } from "./interfaces/registries";

export function registerPlatformModule(
  registry: IModuleRegistry,
  descriptor: ModuleDescriptor
): Result<void> {
  return registry.register(descriptor);
}
