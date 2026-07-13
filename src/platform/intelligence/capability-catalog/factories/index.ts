/**
 * Capability catalog factories.
 *
 * Purpose: Construct catalog instances bound to a registry.
 * Responsibilities: Wire catalog to ICapabilityRegistry via constructor injection.
 * Usage: Callers create registry first, then catalog.
 * Future Extension: Cached catalog projections.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import { CapabilityCatalog } from "../implementations/capability-catalog";
import type { ICapabilityCatalog } from "../interfaces/capability-catalog";

export interface ICapabilityCatalogFactory {
  create(registry: ICapabilityRegistry): ICapabilityCatalog;
}

export class CapabilityCatalogFactory implements ICapabilityCatalogFactory {
  create(registry: ICapabilityRegistry): ICapabilityCatalog {
    return new CapabilityCatalog(registry);
  }
}
