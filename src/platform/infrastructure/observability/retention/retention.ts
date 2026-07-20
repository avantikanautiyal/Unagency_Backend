/**
 * Retention policies.
 */

import type { RetentionPolicy } from "../contracts/telemetry";
import type { ITelemetryStore } from "../interfaces/observability";
import { DEFAULT_RETENTION } from "../constants";

export function applyRetention(
  store: ITelemetryStore,
  policy: RetentionPolicy = DEFAULT_RETENTION,
  clockMs: () => number = () => Date.now()
): number {
  const cutoff = new Date(clockMs() - policy.maxAgeMs).toISOString();
  let purged = store.purgeOlderThan(cutoff);

  if (policy.maxRecords != null) {
    // Soft trim: if still over, purge oldest half of overage via additional age cut
    const total =
      store.listSpans().length +
      store.listMetrics().length +
      store.listLogs().length +
      store.listCosts().length +
      store.listTokens().length;
    if (total > policy.maxRecords) {
      const extraCutoff = new Date(clockMs() - policy.maxAgeMs / 2).toISOString();
      purged += store.purgeOlderThan(extraCutoff);
    }
  }
  return purged;
}
