/**
 * Memory retention engine — classifies retention without persistence backends.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  MemoryClassification,
  MemoryRecord,
  MemoryRetentionPolicy,
} from "../contracts/memory-models";
import type { IMemoryRetentionEngine } from "../interfaces/memory-ports";

export class MemoryRetentionEngine implements IMemoryRetentionEngine {
  classifyRetention(
    classification: MemoryClassification
  ): MemoryRetentionPolicy {
    switch (classification) {
      case "prompt":
      case "response":
      case "conversation":
        return { retentionClass: "short_term" };
      case "execution":
      case "decision":
        return { retentionClass: "working" };
      case "knowledge":
      case "brand_asset":
        return { retentionClass: "long_term" };
      case "evaluation":
      case "human_feedback":
      case "learning_reference":
        return { retentionClass: "long_term" };
      default:
        return { retentionClass: "temporary" };
    }
  }

  apply(
    record: MemoryRecord,
    policy?: MemoryRetentionPolicy
  ): Result<MemoryRecord> {
    const retention = policy ?? this.classifyRetention(record.classification);
    return success({
      ...record,
      retention,
      lifecycleState:
        retention.retentionClass === "archived"
          ? "archived"
          : retention.retentionClass === "deleted"
            ? "deleted"
            : record.lifecycleState,
    });
  }
}
