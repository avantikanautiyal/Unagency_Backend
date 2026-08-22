/**
 * In-memory + pluggable persistence for task graph run snapshots.
 * Tenant-scoped. Optimistic stateVersion for multi-worker claim safety.
 */

import type { TaskGraphRunSnapshot } from "../contracts/task-graph-state";
import { TaskGraphExecutorError } from "../contracts/errors";

export interface ITaskGraphRunStore {
  get(
    executionId: string,
    organizationId: string
  ): Promise<TaskGraphRunSnapshot | undefined>;
  /**
   * Save only if expectedStateVersion matches (or undefined for create).
   * Returns false on conflict.
   */
  compareAndSet(
    snapshot: TaskGraphRunSnapshot,
    expectedStateVersion: number | undefined
  ): Promise<boolean>;
}

export class InMemoryTaskGraphRunStore implements ITaskGraphRunStore {
  private readonly byExec = new Map<string, TaskGraphRunSnapshot>();

  clear(): void {
    this.byExec.clear();
  }

  async get(
    executionId: string,
    organizationId: string
  ): Promise<TaskGraphRunSnapshot | undefined> {
    const snap = this.byExec.get(executionId);
    if (!snap) return undefined;
    if (snap.organizationId !== organizationId) {
      throw new TaskGraphExecutorError(
        "TENANT_VIOLATION",
        "Task graph run organization mismatch"
      );
    }
    return snap;
  }

  async compareAndSet(
    snapshot: TaskGraphRunSnapshot,
    expectedStateVersion: number | undefined
  ): Promise<boolean> {
    const current = this.byExec.get(snapshot.executionId);
    if (expectedStateVersion === undefined) {
      if (current) return false;
      this.byExec.set(snapshot.executionId, snapshot);
      return true;
    }
    if (!current || current.stateVersion !== expectedStateVersion) {
      return false;
    }
    if (current.organizationId !== snapshot.organizationId) {
      throw new TaskGraphExecutorError(
        "TENANT_VIOLATION",
        "Cannot overwrite another tenant's run"
      );
    }
    this.byExec.set(snapshot.executionId, snapshot);
    return true;
  }
}
