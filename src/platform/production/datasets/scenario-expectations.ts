/**
 * Compact scenario expectation datasets (seed metadata).
 */

import { PRODUCTION_SCENARIO_LIBRARY } from "../scenarios/scenario-library";

export const SCENARIO_EXPECTATION_DATASET = PRODUCTION_SCENARIO_LIBRARY.map((s) => ({
  scenarioId: s.scenarioId,
  domain: s.domain,
  qualityThreshold: s.expectations.expectedQualityThreshold,
  latencyMsMax: s.expectations.expectedLatencyMsMax,
  costMax: s.expectations.expectedCostMax,
  capabilities: s.expectations.expectedCapabilities,
}));

export const DATASET_VERSION = "1.0.0";
