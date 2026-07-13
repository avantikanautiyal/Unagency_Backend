/**
 * In-memory capability catalog.
 *
 * Purpose: Expose discovery APIs over the capability registry.
 * Responsibilities: search, browse, filter, categories, tags, popular/recent/featured.
 * Usage: Construct with ICapabilityRegistry — catalog never owns data.
 * Future Extension: Ranking signals, cached projections.
 */

import type { CapabilityId } from "../../shared/identifiers";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import type { CapabilityStatus } from "../../capability-registry/contracts/capability-status";
import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type {
  CatalogBrowseOptions,
  CatalogFilter,
  CatalogSort,
} from "../contracts/catalog-query";
import type { ICapabilityCatalog } from "../interfaces/capability-catalog";

function matchesFilter(
  capability: CapabilityDefinition,
  filter: CatalogFilter
): boolean {
  if (filter.category && capability.category !== filter.category) {
    return false;
  }
  if (filter.subcategory && capability.subcategory !== filter.subcategory) {
    return false;
  }
  if (filter.owner && capability.owner !== filter.owner) {
    return false;
  }
  if (filter.visibility && capability.visibility !== filter.visibility) {
    return false;
  }
  if (filter.status) {
    const statuses: readonly CapabilityStatus[] = Array.isArray(filter.status)
      ? filter.status
      : [filter.status];
    if (!statuses.includes(capability.status)) {
      return false;
    }
  }
  if (filter.tags?.length) {
    const tagSet = new Set(capability.tags);
    if (!filter.tags.every((tag) => tagSet.has(tag))) {
      return false;
    }
  }
  if (filter.query) {
    const q = filter.query.toLowerCase();
    const haystack = [
      capability.name,
      capability.displayName,
      capability.description,
      capability.category,
      capability.subcategory ?? "",
      ...capability.tags,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) {
      return false;
    }
  }
  return true;
}

function sortCapabilities(
  items: CapabilityDefinition[],
  sort?: CatalogSort
): CapabilityDefinition[] {
  if (!sort) {
    return items;
  }
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = String(a[sort.field] ?? "");
    const right = String(b[sort.field] ?? "");
    return left.localeCompare(right) * direction;
  });
}

export class CapabilityCatalog implements ICapabilityCatalog {
  constructor(private readonly registry: ICapabilityRegistry) {}

  async findById(
    id: CapabilityId,
    version?: string
  ): Promise<Result<CapabilityDefinition>> {
    return this.registry.resolve(id, version ? { version } : undefined);
  }

  async findByCategory(
    category: string
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    return this.filter({ category });
  }

  async findByTag(tag: string): Promise<Result<readonly CapabilityDefinition[]>> {
    return this.filter({ tags: [tag] });
  }

  async findByName(
    name: string
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    const items = this.registry
      .list()
      .filter(
        (capability) =>
          capability.name === name || capability.displayName === name
      );
    return success(items);
  }

  async list(): Promise<Result<readonly CapabilityDefinition[]>> {
    return success(this.registry.list());
  }

  async search(query: string): Promise<Result<readonly CapabilityDefinition[]>> {
    return this.filter({ query });
  }

  async filter(
    filter: CatalogFilter
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    const items = this.registry.list().filter((capability) =>
      matchesFilter(capability, filter)
    );
    return success(items);
  }

  async browse(
    options: CatalogBrowseOptions = {}
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    let items = options.filter
      ? this.registry.list().filter((capability) =>
          matchesFilter(capability, options.filter as CatalogFilter)
        )
      : [...this.registry.list()];

    items = sortCapabilities(items, options.sort);

    const offset = options.offset ?? 0;
    const limit = options.limit ?? items.length;
    return success(items.slice(offset, offset + limit));
  }

  async categories(): Promise<Result<readonly string[]>> {
    const set = new Set(this.registry.list().map((c) => c.category));
    return success([...set].sort());
  }

  async tags(): Promise<Result<readonly string[]>> {
    const set = new Set(this.registry.list().flatMap((c) => c.tags));
    return success([...set].sort());
  }

  async popular(
    limit = 10
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    // Simple heuristic: published capabilities sorted by name (no metrics store yet)
    const items = this.registry
      .list()
      .filter((c) => c.status === "published")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
    return success(items);
  }

  async recent(
    limit = 10
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    const items = [...this.registry.list()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
    return success(items);
  }

  async featured(
    limit = 10
  ): Promise<Result<readonly CapabilityDefinition[]>> {
    const items = this.registry
      .list()
      .filter((c) => c.metadata.featured === true || c.tags.includes("featured"))
      .slice(0, limit);
    return success(items);
  }

  async get(
    id: CapabilityId,
    version?: string
  ): Promise<Result<CapabilityDefinition>> {
    return this.findById(id, version);
  }

  async has(id: CapabilityId, version?: string): Promise<boolean> {
    return this.registry.exists(id, version);
  }
}
