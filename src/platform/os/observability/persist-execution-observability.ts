/**
 * Non-blocking durable persistence for finalized execution observability records.
 * Observability failure must never affect production execution delivery.
 */

import { isDurableRuntimeEnabled } from "../../infrastructure/durability/durable-mode";
import {
  buildDurableExecutionObservabilityRecord,
  type BuildDurableObservabilityInput,
} from "./execution-observability-record-builder";
import {
  defaultExecutionObservabilityStore,
  type IExecutionObservabilityStore,
} from "./execution-observability-store";
import { MongoExecutionObservabilityStore } from "./mongo-execution-observability-store";
import { sanitizeOsLogFields } from "./execution-log";

export const EXECUTION_OBSERVABILITY_PREFIX = "[UNAGENCY-EXECUTION-OBSERVABILITY]" as const;

let mongoObservabilityStore: MongoExecutionObservabilityStore | undefined;

function resolveMongoObservabilityStore(): MongoExecutionObservabilityStore {
  if (!mongoObservabilityStore) {
    mongoObservabilityStore = new MongoExecutionObservabilityStore();
  }
  return mongoObservabilityStore;
}

export function resolveExecutionObservabilityStore(
  env: NodeJS.ProcessEnv = process.env,
): IExecutionObservabilityStore {
  if (isDurableRuntimeEnabled(env)) {
    return resolveMongoObservabilityStore();
  }
  return defaultExecutionObservabilityStore;
}

export function logExecutionObservabilityPersistenceFailure(
  executionId: string,
  reason: string,
): void {
  try {
    const safe = sanitizeOsLogFields({
      event: "execution.observability.persistence_unavailable",
      executionId,
      reason,
    });
    console.log(`${EXECUTION_OBSERVABILITY_PREFIX} ${JSON.stringify(safe)}`);
  } catch {
    // Observability must never break execution.
  }
}

export async function persistExecutionObservability(
  input: BuildDurableObservabilityInput,
  store?: IExecutionObservabilityStore,
): Promise<"inserted" | "duplicate" | "skipped" | "unavailable"> {
  const target = store ?? resolveExecutionObservabilityStore();
  try {
    const record = buildDurableExecutionObservabilityRecord(input);
    const result = await target.finalize(record);
    if (result === "unavailable") {
      logExecutionObservabilityPersistenceFailure(
        record.executionId,
        "observability_store_unavailable",
      );
    }
    return result;
  } catch (err) {
    logExecutionObservabilityPersistenceFailure(
      input.trace.executionId,
      err instanceof Error ? err.message : String(err),
    );
    return "unavailable";
  }
}

/** Fire-and-forget — production delivery must never depend on observability persistence. */
export function schedulePersistExecutionObservability(
  input: BuildDurableObservabilityInput,
  store?: IExecutionObservabilityStore,
): void {
  try {
    void persistExecutionObservability(input, store).catch((err) => {
      logExecutionObservabilityPersistenceFailure(
        input.trace.executionId,
        err instanceof Error ? err.message : String(err),
      );
    });
  } catch (err) {
    logExecutionObservabilityPersistenceFailure(
      input.trace.executionId,
      err instanceof Error ? err.message : String(err),
    );
  }
}
