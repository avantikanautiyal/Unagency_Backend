/**
 * Pagination contracts for list-style platform queries.
 */

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface PageResponse<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly totalCount?: number;
}
