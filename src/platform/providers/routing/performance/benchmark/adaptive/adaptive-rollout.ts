/**
 * Step 12 — Deterministic rollout (no Math.random).
 */

import { createHash } from "crypto";

export function deterministicRolloutBucket(input: {
  readonly requestId: string;
  readonly policyVersion: string;
  readonly policyId: string;
}): number {
  const digest = createHash("sha256")
    .update(`${input.policyId}:${input.policyVersion}:${input.requestId}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

export function isRolloutSelected(bucket: number, rolloutPercentage: number): boolean {
  const pct = Math.max(0, Math.min(100, Math.floor(rolloutPercentage)));
  return bucket < pct;
}
