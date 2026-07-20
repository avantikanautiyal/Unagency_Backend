export const DISTRIBUTED_EXECUTION_VERSION = "1.0.0";

export const DEFAULT_RETRY_POLICY = {
  strategy: "exponential" as const,
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 5_000,
  retryableClasses: ["transient", "timeout", "provider"],
};

export const DEFAULT_WORKER_CAPACITY = 2;
export const DEFAULT_LEASE_TTL_MS = 30_000;
export const PRIORITY_SCORES = {
  critical: 1000,
  high: 750,
  normal: 500,
  low: 250,
  bulk: 100,
} as const;
