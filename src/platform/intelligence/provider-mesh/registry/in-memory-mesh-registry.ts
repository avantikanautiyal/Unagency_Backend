/**
 * In-memory mesh provider registry.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { IMeshRegistry } from "../interfaces/mesh";

export class InMemoryMeshRegistry implements IMeshRegistry {
  private readonly byId = new Map<string, ProviderOperationalRecord>();

  upsert(record: ProviderOperationalRecord): Result<ProviderOperationalRecord> {
    this.byId.set(record.providerId, record);
    return success(record);
  }

  get(providerId: string): Result<ProviderOperationalRecord | undefined> {
    return success(this.byId.get(providerId));
  }

  list(): Result<readonly ProviderOperationalRecord[]> {
    return success([...this.byId.values()]);
  }

  clear(): Result<void> {
    this.byId.clear();
    return success(undefined);
  }
}
