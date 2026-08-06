/**
 * Shared execution history filtering (M10.16).
 */

import type { ExecutionResource } from "../../../api/contracts";
import type {
  ExecutionHistoryPage,
  ExecutionHistoryQuery,
} from "../interfaces/execution-store-ports";

function normalizeQuery(
  queryOrLimit?: ExecutionHistoryQuery | number
): ExecutionHistoryQuery & { limit: number; offset: number; page: number } {
  const base: ExecutionHistoryQuery =
    typeof queryOrLimit === "number" ? { limit: queryOrLimit } : queryOrLimit ?? {};
  const limit = Math.min(Math.max(base.limit ?? 50, 1), 200);
  const page = Math.max(base.page ?? 1, 1);
  const offset = base.offset ?? (page - 1) * limit;
  return { ...base, limit, offset, page };
}

export function applyExecutionHistoryQuery(
  rows: readonly ExecutionResource[],
  organizationId: string,
  queryOrLimit?: ExecutionHistoryQuery | number
): ExecutionHistoryPage {
  const query = normalizeQuery(queryOrLimit);
  let filtered = rows.filter((e) => e.organizationId === organizationId);

  if (!query.includeDeleted) {
    filtered = filtered.filter((e) => !e.deletedAt);
  }
  if (query.pinned === true) {
    filtered = filtered.filter((e) => e.pinned === true);
  } else if (query.pinned === false) {
    filtered = filtered.filter((e) => !e.pinned);
  }
  if (query.favorite === true) {
    filtered = filtered.filter((e) => e.favorite === true);
  } else if (query.favorite === false) {
    filtered = filtered.filter((e) => !e.favorite);
  }
  if (query.status?.trim()) {
    const statuses = new Set(
      query.status.split(",").map((s) => s.trim()).filter(Boolean)
    );
    filtered = filtered.filter((e) => statuses.has(e.status));
  }
  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.promptPreview.toLowerCase().includes(q) ||
        e.executionId.toLowerCase().includes(q)
    );
  }

  filtered = [...filtered].sort((a, b) => {
    const cmp = a.createdAt.localeCompare(b.createdAt);
    return query.sort === "oldest" ? cmp : -cmp;
  });

  const total = filtered.length;
  const items = filtered.slice(query.offset, query.offset + query.limit);
  return {
    items,
    page: query.page,
    limit: query.limit,
    total,
  };
}

export function mongoHistoryFilter(
  organizationId: string,
  queryOrLimit?: ExecutionHistoryQuery | number
): Record<string, unknown> {
  const query = normalizeQuery(queryOrLimit);
  const filter: Record<string, unknown> = { organizationId };

  if (!query.includeDeleted) {
    filter.$or = [{ deletedAt: { $exists: false } }, { deletedAt: null }];
  }
  if (query.pinned === true) filter.pinned = true;
  else if (query.pinned === false) filter.pinned = { $ne: true };
  if (query.favorite === true) filter.favorite = true;
  else if (query.favorite === false) filter.favorite = { $ne: true };
  if (query.status?.trim()) {
    const statuses = query.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length) filter.status = { $in: statuses };
  }
  if (query.q?.trim()) {
    const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.promptPreview = { $regex: escaped, $options: "i" };
  }
  return filter;
}

export { normalizeQuery as normalizeExecutionHistoryQuery };
