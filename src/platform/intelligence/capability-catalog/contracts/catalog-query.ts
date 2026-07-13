/**
 * Catalog query contracts.
 *
 * Purpose: Describe discovery filters and sort options.
 * Responsibilities: Search/browse/filter/sort request shapes.
 * Usage: Passed to ICapabilityCatalog methods.
 * Future Extension: Faceted search, pagination cursors.
 */

import type { CapabilityStatus } from "../../capability-registry/contracts/capability-status";
import type { CapabilityVisibility } from "../../capability-registry/contracts/capability-definition";

export type CatalogSortField =
  | "name"
  | "category"
  | "updatedAt"
  | "createdAt"
  | "version";

export type CatalogSortDirection = "asc" | "desc";

export interface CatalogFilter {
  readonly category?: string;
  readonly subcategory?: string;
  readonly tags?: readonly string[];
  readonly status?: CapabilityStatus | readonly CapabilityStatus[];
  readonly visibility?: CapabilityVisibility;
  readonly owner?: string;
  readonly query?: string;
}

export interface CatalogSort {
  readonly field: CatalogSortField;
  readonly direction?: CatalogSortDirection;
}

export interface CatalogBrowseOptions {
  readonly filter?: CatalogFilter;
  readonly sort?: CatalogSort;
  readonly limit?: number;
  readonly offset?: number;
}
