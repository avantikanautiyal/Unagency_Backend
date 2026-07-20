export const OBSERVABILITY_VERSION = "1.0.0";

export const DEFAULT_RETENTION: import("../contracts/telemetry").RetentionPolicy = {
  class: "hot",
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxRecords: 50_000,
};

export const DEFAULT_ALERT_THRESHOLDS = {
  latencyMs: 30_000,
  failureRate: 0.25,
  costPerRequest: 5,
  queueDepth: 100,
  workerUtilization: 0.9,
  retryStormCount: 20,
  budgetUsagePercent: 80,
};
