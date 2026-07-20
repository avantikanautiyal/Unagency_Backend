/** Provider Mesh constants. */

export const PROVIDER_MESH_VERSION = "1.0.0";

export const SCORE_WEIGHTS = {
  availability: 0.2,
  latency: 0.15,
  reliability: 0.2,
  quality: 0.15,
  historicalSuccess: 0.1,
  cost: 0.05,
  certification: 0.1,
  currentLoad: 0.05,
} as const;

export const DEGRADED_ERROR_RATE = 0.15;
export const UNAVAILABLE_ERROR_RATE = 0.5;
export const BUSY_UTILIZATION = 0.85;
export const RATE_LIMIT_ERROR_HINT = 0.3;
