/**
 * Validation Platform factory.
 */

import {
  createProductionValidationPlatform,
  type ProductionValidationPlatform,
} from "../../production/factories/create-production-validation-platform";
import { setupOpenAIProvider } from "../../intelligence/providers/openai/testing";
import { ValidationOrchestrator, type ValidationOrchestratorDeps } from "../orchestrator/validation-orchestrator";
import type { IValidationOrchestrator } from "../interfaces/validation";

export interface ValidationPlatform {
  readonly orchestrator: IValidationOrchestrator;
  readonly production: ProductionValidationPlatform;
}

export interface CreateValidationPlatformOptions extends Omit<ValidationOrchestratorDeps, "productionEngine"> {
  readonly production?: ProductionValidationPlatform;
}

export async function createValidationPlatform(
  options: CreateValidationPlatformOptions = {}
): Promise<ValidationPlatform> {
  const helpers = {
    createId: options.createId ?? ((p: string) => `${p}_${Date.now()}`),
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
    clockMs: options.clockMs ?? (() => Date.now()),
  };

  const production =
    options.production ??
    createProductionValidationPlatform({
      mode: "openai_simulated",
      openai: await setupOpenAIProvider(helpers),
      ...helpers,
    });

  const orchestrator = new ValidationOrchestrator({
    productionEngine: production.engine,
    ...helpers,
  });

  return { orchestrator, production };
}
