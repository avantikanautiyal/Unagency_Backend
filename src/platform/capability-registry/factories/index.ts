/**
 * Capability registry factories.
 *
 * Purpose: Construct registry components without static singletons.
 * Responsibilities: Create validator and registry instances.
 * Usage: Callers and catalog composition.
 * Future Extension: Persistent registry factories.
 */

import { CapabilityRegistry } from "../implementations/capability-registry";
import { CapabilityValidator } from "../implementations/capability-validator";
import type { ICapabilityRegistry } from "../interfaces/capability-registry";
import type { ICapabilityValidator } from "../interfaces/capability-validator";

export interface ICapabilityRegistryFactory {
  create(validator?: ICapabilityValidator): ICapabilityRegistry;
}

export class CapabilityRegistryFactory implements ICapabilityRegistryFactory {
  create(validator: ICapabilityValidator = new CapabilityValidator()): ICapabilityRegistry {
    return new CapabilityRegistry(validator);
  }
}
