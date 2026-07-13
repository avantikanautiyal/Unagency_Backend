/**
 * Memory lifecycle transitions (in-memory only).
 */

import type { MemoryLifecycleState, MemoryRecord } from "../contracts/memory-models";

const TRANSITIONS: Readonly<
  Record<MemoryLifecycleState, readonly MemoryLifecycleState[]>
> = {
  draft: ["active", "deleted"],
  active: ["compressed", "archived", "deleted"],
  compressed: ["archived", "deleted", "active"],
  archived: ["deleted"],
  deleted: [],
};

export function canTransitionMemoryLifecycle(
  from: MemoryLifecycleState,
  to: MemoryLifecycleState
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionMemoryLifecycle(
  record: MemoryRecord,
  to: MemoryLifecycleState,
  nowIso: string
): MemoryRecord | undefined {
  if (!canTransitionMemoryLifecycle(record.lifecycleState, to)) {
    return undefined;
  }
  return {
    ...record,
    lifecycleState: to,
    metadata: {
      ...record.metadata,
      updatedAt: nowIso,
    },
  };
}
