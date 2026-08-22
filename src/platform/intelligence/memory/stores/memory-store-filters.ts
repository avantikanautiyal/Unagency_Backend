/**
 * Shared filter logic for memory store implementations.
 */

import type { MemoryRecord, MemoryRequest } from "../contracts/memory-models";

export function matchesMemoryRequest(
  record: MemoryRecord,
  request: MemoryRequest
): boolean {
  if (
    String(record.identity.organizationId) !==
    String(request.identity.organizationId)
  ) {
    return false;
  }
  if (
    String(record.identity.workspaceId) !== String(request.identity.workspaceId)
  ) {
    return false;
  }
  if (request.scope && record.scope.kind !== request.scope.kind) {
    return false;
  }
  if (request.scope && record.scope.scopeId !== request.scope.scopeId) {
    return false;
  }
  if (
    request.classifications?.length &&
    !request.classifications.includes(record.classification)
  ) {
    return false;
  }
  if (!request.includeDeleted && record.lifecycleState === "deleted") {
    return false;
  }
  if (request.from) {
    const from = Date.parse(request.from);
    const created = Date.parse(record.metadata.createdAt);
    if (Number.isFinite(from) && created < from) return false;
  }
  if (request.to) {
    const to = Date.parse(request.to);
    const created = Date.parse(record.metadata.createdAt);
    if (Number.isFinite(to) && created > to) return false;
  }
  return true;
}
