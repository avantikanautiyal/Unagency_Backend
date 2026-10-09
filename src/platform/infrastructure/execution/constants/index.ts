export const DISTRIBUTED_EXECUTION_VERSION = "1.0.0";

export const DEFAULT_RETRY_POLICY = {
  strategy: "exponential" as const,
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 5_000,
  retryableClasses: ["transient", "timeout", "provider"],
};

export const DEFAULT_WORKER_CAPACITY = 2;
/**
 * Must comfortably exceed a full live media run (pre-provider context build +
 * provider call + materialize/ingest ≈ 3–5 min) so a few missed heartbeats can
 * never expire an active owner's lease and discard a finished generation.
 */
export const DEFAULT_LEASE_TTL_MS = 600_000;
/** Heartbeat cadence cap — renew often even when the lease TTL is long. */
export const MAX_LEASE_HEARTBEAT_MS = 15_000;
export const PRIORITY_SCORES = {
  critical: 1000,
  high: 750,
  normal: 500,
  low: 250,
  bulk: 100,
} as const;
