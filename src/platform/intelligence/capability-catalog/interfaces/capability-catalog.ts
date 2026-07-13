/**
 * Capability Catalog port.
 *
 * Purpose: Discovery and browsing over registered capabilities.
 * Responsibilities: search, browse, categories, tags, popular/recent/featured.
 * Usage: Injected with ICapabilityRegistry; never owns capability data.
 * Future Extension: Ranked popularity metrics, featured flags from metadata.
 */

import type { CapabilityId } from "../../shared/identifiers";
import type { Result } from "../../shared/result";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import type { CatalogBrowseOptions, CatalogFilter } from "../contracts/catalog-query";

export interface ICapabilityCatalog {
  /** Find by id (optional version). */
  findById(
    id: CapabilityId,
    version?: string
  ): Promise<Result<CapabilityDefinition>>;

  findByCategory(category: string): Promise<Result<readonly CapabilityDefinition[]>>;

  findByTag(tag: string): Promise<Result<readonly CapabilityDefinition[]>>;

  findByName(name: string): Promise<Result<readonly CapabilityDefinition[]>>;

  list(): Promise<Result<readonly CapabilityDefinition[]>>;

  search(query: string): Promise<Result<readonly CapabilityDefinition[]>>;

  filter(filter: CatalogFilter): Promise<Result<readonly CapabilityDefinition[]>>;

  browse(
    options?: CatalogBrowseOptions
  ): Promise<Result<readonly CapabilityDefinition[]>>;

  categories(): Promise<Result<readonly string[]>>;

  tags(): Promise<Result<readonly string[]>>;

  popular(limit?: number): Promise<Result<readonly CapabilityDefinition[]>>;

  recent(limit?: number): Promise<Result<readonly CapabilityDefinition[]>>;

  featured(limit?: number): Promise<Result<readonly CapabilityDefinition[]>>;

  /** @deprecated Prefer findById */
  get(
    id: CapabilityId,
    version?: string
  ): Promise<Result<CapabilityDefinition>>;

  has(id: CapabilityId, version?: string): Promise<boolean>;
}

/**
 * Optional loader for seeding a registry from external sources (not implemented).
 */
export interface ICapabilityCatalogLoader {
  load(): Promise<Result<readonly CapabilityDefinition[]>>;
}
