/**
 * Validation Platform testing helpers.
 */

import {
  createValidationPlatform,
  type CreateValidationPlatformOptions,
  type ValidationPlatform,
} from "../factories/create-validation-platform";
import type { ValidationRunRequest } from "../contracts";

export function deterministicValidationHelpers() {
  let id = 0;
  let ms = 100_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 7),
  };
}

export async function setupValidationPlatform(
  options: CreateValidationPlatformOptions = {}
): Promise<ValidationPlatform> {
  const helpers = deterministicValidationHelpers();
  return createValidationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export function sampleValidationRunRequest(
  overrides: Partial<ValidationRunRequest> = {}
): ValidationRunRequest {
  return {
    runId: "val_run_1",
    scenarioIds: ["gateway_e2e"],
    includeFailureSimulation: true,
    includeLoadTesting: true,
    includeRecoveryTesting: true,
    includeSecurityValidation: true,
    loadProfile: "load_10",
    ...overrides,
  };
}
