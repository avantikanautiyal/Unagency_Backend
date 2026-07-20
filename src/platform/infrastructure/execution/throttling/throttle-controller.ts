/**
 * Organization / workspace / provider throttling.
 */

import type { ThrottleLimits } from "../contracts/job";

export class ThrottleController {
  private readonly counts = new Map<string, number>();
  private readonly windowStarts = new Map<string, number>();
  private readonly windowCounts = new Map<string, number>();

  constructor(private readonly clockMs: () => number = () => Date.now()) {}

  private key(parts: (string | undefined)[]): string {
    return parts.filter(Boolean).join(":");
  }

  tryEnter(limits: ThrottleLimits): boolean {
    const k = this.key([
      limits.organizationId,
      limits.workspaceId,
      limits.providerId,
      limits.capabilityId,
    ]);
    const current = this.counts.get(k) ?? 0;
    if (current >= limits.maxConcurrent) return false;

    if (limits.maxPerMinute != null) {
      const now = this.clockMs();
      const start = this.windowStarts.get(k) ?? now;
      if (now - start >= 60_000) {
        this.windowStarts.set(k, now);
        this.windowCounts.set(k, 0);
      }
      const w = this.windowCounts.get(k) ?? 0;
      if (w >= limits.maxPerMinute) return false;
      this.windowCounts.set(k, w + 1);
    }

    this.counts.set(k, current + 1);
    return true;
  }

  exit(limits: ThrottleLimits): void {
    const k = this.key([
      limits.organizationId,
      limits.workspaceId,
      limits.providerId,
      limits.capabilityId,
    ]);
    const current = this.counts.get(k) ?? 0;
    this.counts.set(k, Math.max(0, current - 1));
  }
}
