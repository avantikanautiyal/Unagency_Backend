/**
 * Production Validation testing helpers.
 */

import {
  createProductionValidationPlatform,
  type CreateProductionValidationOptions,
  type ProductionValidationPlatform,
} from "../factories/create-production-validation-platform";
import { ProductionValidationRequestBuilder } from "../builders/production-validation-request-builder";
import { listScenarioIds } from "../scenarios/scenario-library";
import { setupOpenAIProvider } from "../../intelligence/providers/openai/testing";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-15T00:00:00.000Z",
    clockMs: () => (ms += 11),
  };
}

/** Boots platform with real OpenAI leaf in simulated transport (no network). */
export async function setupProductionValidation(
  options: CreateProductionValidationOptions = {}
): Promise<ProductionValidationPlatform> {
  const helpers = deterministicHelpers();
  const openai = await setupOpenAIProvider({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
  });
  return createProductionValidationPlatform({
    mode: "openai_simulated",
    openai,
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export function sampleValidationRequest(scenarioId = "scn_retail") {
  return ProductionValidationRequestBuilder.create()
    .withRequestId("prod_val_1")
    .withScenarioId(scenarioId)
    .withCorrelationId("corr_prod_1")
    .withMode("openai_simulated")
    .withBudgetLimit(500)
    .build();
}

export { listScenarioIds };
