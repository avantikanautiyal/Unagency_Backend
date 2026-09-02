/**
 * In-memory session store.
 *
 * Purpose: Track live provider execution sessions.
 * Responsibilities: save/get/list/delete/clear session records.
 * Usage: Injected into the runtime.
 * Future Extension: Durable session stores.
 */

import { failure, success } from "../../../core/result";
import type { Result } from "../../../core/result";
import type { ProviderSession } from "../contracts/provider-session";
import { ProviderSessionNotFoundError } from "../errors";

export interface IProviderSessionStore {
  save(record: ProviderSession): Result<ProviderSession>;
  get(sessionId: string): Result<ProviderSession>;
  list(): readonly ProviderSession[];
  delete(sessionId: string): Result<void>;
  clear(): void;
}

export class InMemoryProviderSessionStore implements IProviderSessionStore {
  private readonly records = new Map<string, ProviderSession>();

  save(record: ProviderSession): Result<ProviderSession> {
    this.records.set(record.sessionId, record);
    return success(record);
  }

  get(sessionId: string): Result<ProviderSession> {
    const record = this.records.get(sessionId);
    if (!record) {
      return failure(
        new ProviderSessionNotFoundError("Provider session not found", {
          sessionId,
        })
      );
    }
    return success(record);
  }

  list(): readonly ProviderSession[] {
    return Array.from(this.records.values());
  }

  delete(sessionId: string): Result<void> {
    if (!this.records.has(sessionId)) {
      return failure(
        new ProviderSessionNotFoundError("Provider session not found", {
          sessionId,
        })
      );
    }
    this.records.delete(sessionId);
    return success(undefined);
  }

  clear(): void {
    this.records.clear();
  }
}
