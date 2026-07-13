/**
 * In-memory execution store.
 *
 * Purpose: Persist session records without MongoDB.
 * Responsibilities: save, get, list, delete, clear.
 * Usage: Injected into ExecutionRuntime.
 * Future Extension: Durable store adapters.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ExecutionSessionRecord } from "../contracts/execution-session";
import { ExecutionNotFoundError } from "../errors";

export interface IExecutionStore {
  save(record: ExecutionSessionRecord): Result<ExecutionSessionRecord>;
  get(sessionId: string): Result<ExecutionSessionRecord>;
  list(): readonly ExecutionSessionRecord[];
  delete(sessionId: string): Result<void>;
  clear(): void;
}

export class InMemoryExecutionStore implements IExecutionStore {
  private readonly records = new Map<string, ExecutionSessionRecord>();

  save(record: ExecutionSessionRecord): Result<ExecutionSessionRecord> {
    this.records.set(record.sessionId, record);
    return success(record);
  }

  get(sessionId: string): Result<ExecutionSessionRecord> {
    const record = this.records.get(sessionId);
    if (!record) {
      return failure(
        new ExecutionNotFoundError("Execution session not found", { sessionId })
      );
    }
    return success(record);
  }

  list(): readonly ExecutionSessionRecord[] {
    return Array.from(this.records.values());
  }

  delete(sessionId: string): Result<void> {
    if (!this.records.has(sessionId)) {
      return failure(
        new ExecutionNotFoundError("Execution session not found", { sessionId })
      );
    }
    this.records.delete(sessionId);
    return success(undefined);
  }

  clear(): void {
    this.records.clear();
  }
}
