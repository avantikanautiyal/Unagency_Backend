/**
 * Monitoring counters for the secret platform.
 */

import type { ISecretMonitor } from "../interfaces/secrets";
import type { SecretHealthReport } from "../contracts/secret";

export class DefaultSecretMonitor implements ISecretMonitor {
  private rotationFailures = 0;

  constructor(private readonly nowIso: () => string) {}

  recordRotationFailure(): void {
    this.rotationFailures += 1;
  }

  getRotationFailures(): number {
    return this.rotationFailures;
  }

  snapshot(
    partial: Omit<SecretHealthReport, "checkedAt" | "healthy"> & { healthy?: boolean }
  ): SecretHealthReport {
    return {
      healthy: partial.healthy ?? true,
      providerKind: partial.providerKind,
      secretCount: partial.secretCount,
      expiredCount: partial.expiredCount,
      nearExpirationCount: partial.nearExpirationCount,
      rotationFailureCount: partial.rotationFailureCount ?? this.rotationFailures,
      activeLeaseCount: partial.activeLeaseCount,
      cacheHits: partial.cacheHits,
      cacheMisses: partial.cacheMisses,
      validatedCount: partial.validatedCount,
      checkedAt: this.nowIso(),
    };
  }
}
