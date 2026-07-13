/**
 * Placeholder compression strategies — architecture only.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  MemoryCompressionStrategyName,
  MemoryRecord,
} from "../contracts/memory-models";
import type { IMemoryCompressionStrategy } from "../interfaces/memory-ports";

abstract class PassthroughCompression implements IMemoryCompressionStrategy {
  abstract readonly name: MemoryCompressionStrategyName;

  async compress(
    records: readonly MemoryRecord[]
  ): Promise<Result<readonly MemoryRecord[]>> {
    // Placeholder: no real compression algorithms
    return success(records);
  }
}

export class MergeCompressionStrategy extends PassthroughCompression {
  readonly name = "merge" as const;
}

export class DeduplicateCompressionStrategy extends PassthroughCompression {
  readonly name = "deduplicate" as const;

  override async compress(
    records: readonly MemoryRecord[]
  ): Promise<Result<readonly MemoryRecord[]>> {
    const seen = new Set<string>();
    const unique = records.filter((record) => {
      const key = JSON.stringify(record.content);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return success(unique);
  }
}

export class SummarizeCompressionStrategy extends PassthroughCompression {
  readonly name = "summarize" as const;
}

export class ImportanceRankingCompressionStrategy extends PassthroughCompression {
  readonly name = "importance_ranking" as const;

  override async compress(
    records: readonly MemoryRecord[]
  ): Promise<Result<readonly MemoryRecord[]>> {
    return success(
      [...records].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    );
  }
}

export function resolveCompressionStrategy(
  name: MemoryCompressionStrategyName = "deduplicate"
): IMemoryCompressionStrategy {
  switch (name) {
    case "merge":
      return new MergeCompressionStrategy();
    case "summarize":
      return new SummarizeCompressionStrategy();
    case "importance_ranking":
      return new ImportanceRankingCompressionStrategy();
    case "deduplicate":
    default:
      return new DeduplicateCompressionStrategy();
  }
}
