/**
 * Execution Optimization request contract.
 */

import type { CapabilityId } from "../../shared/identifiers";
import type { ExecutionOptimizationInputs } from "./inputs";

export interface ExecutionOptimizationPreferences {
  readonly maxRecommendations?: number;
  readonly minConfidence?: number;
  readonly includeSimulation?: boolean;
  readonly includeBenchmark?: boolean;
  readonly domains?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ExecutionOptimizationRequest {
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly inputs: ExecutionOptimizationInputs;
  readonly preferences?: ExecutionOptimizationPreferences;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
