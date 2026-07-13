/**
 * Placeholder memory retriever.
 */

import type { Result } from "../../shared/result";
import type { MemoryRecord, MemoryRequest } from "../contracts/memory-models";
import type { IMemoryRetriever, IMemoryStore } from "../interfaces/memory-ports";

export class MemoryRetriever implements IMemoryRetriever {
  constructor(private readonly store: IMemoryStore) {}

  async retrieve(
    request: MemoryRequest
  ): Promise<Result<readonly MemoryRecord[]>> {
    return this.store.list(request);
  }
}
