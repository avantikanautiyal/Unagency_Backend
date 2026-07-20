/**
 * Heartbeat tracking helpers.
 */

import type { ProviderMeshEvent } from "../contracts/inputs";

export function latestHeartbeatAt(
  events: readonly ProviderMeshEvent[],
  fallback: string
): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === "health" || e.kind === "telemetry" || e.kind === "execution") {
      return e.observedAt;
    }
  }
  return events[events.length - 1]?.observedAt ?? fallback;
}

export function isStaleHeartbeat(lastHeartbeatAt: string, nowIso: string, maxAgeMs: number): boolean {
  const last = Date.parse(lastHeartbeatAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return false;
  return now - last > maxAgeMs;
}
