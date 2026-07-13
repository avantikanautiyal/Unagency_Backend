/**
 * In-memory adapter lifecycle manager.
 *
 * Purpose: Track and transition adapter lifecycle states.
 * Responsibilities: register, transition (guarded), current, list, remove.
 * Usage: Injected into the registry.
 * Future Extension: Persistent lifecycle store; scheduled maintenance.
 */

import { failure, success, type Result } from "../../../shared/result";
import {
  canTransitionLifecycle,
  type ProviderLifecycleState,
} from "../contracts/enums";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type { ProviderLifecycleRecord } from "../contracts/lifecycle-streaming";
import { AdapterLifecycleError } from "../errors/adapter-errors";
import type { IAdapterLifecycleManager } from "../interfaces/lifecycle-streaming";

export class InMemoryAdapterLifecycleManager
  implements IAdapterLifecycleManager
{
  private readonly records = new Map<string, ProviderLifecycleRecord>();

  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  register(adapterId: ProviderAdapterId): ProviderLifecycleRecord {
    const record: ProviderLifecycleRecord = {
      adapterId,
      state: "registered",
      since: this.nowIso(),
    };
    this.records.set(String(adapterId), record);
    return record;
  }

  transition(
    adapterId: ProviderAdapterId,
    to: ProviderLifecycleState,
    reason?: string
  ): Result<ProviderLifecycleRecord> {
    const current = this.records.get(String(adapterId));
    if (!current) {
      return failure(
        new AdapterLifecycleError("adapter is not registered in lifecycle", {
          adapterId,
        })
      );
    }
    if (!canTransitionLifecycle(current.state, to)) {
      return failure(
        new AdapterLifecycleError(
          `illegal lifecycle transition ${current.state} → ${to}`,
          { adapterId, from: current.state, to }
        )
      );
    }
    const record: ProviderLifecycleRecord = {
      adapterId,
      state: to,
      since: this.nowIso(),
      reason,
    };
    this.records.set(String(adapterId), record);
    return success(record);
  }

  current(adapterId: ProviderAdapterId): ProviderLifecycleState | undefined {
    return this.records.get(String(adapterId))?.state;
  }

  list(): readonly ProviderLifecycleRecord[] {
    return [...this.records.values()];
  }

  remove(adapterId: ProviderAdapterId): void {
    this.records.delete(String(adapterId));
  }
}
