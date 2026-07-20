/**
 * Capacity reporter.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { ProviderCapacityReport } from "../contracts/recommendations";

export class DefaultCapacityReporter {
  report(records: readonly ProviderOperationalRecord[]): Result<readonly ProviderCapacityReport[]> {
    return success(
      records.map((r) => {
        const utilization = r.telemetry.capacityUtilization;
        return {
          providerId: r.providerId,
          capacityUtilization: utilization,
          concurrentExecutions: r.telemetry.concurrentExecutions,
          headroom: Math.max(0, 1 - utilization),
          constrained: utilization >= 0.85 || r.state === "busy" || r.state === "rate_limited",
        };
      })
    );
  }
}
