/**
 * Pricing engine.
 */

import { success, type Result } from "../../core/result";
import type { CanonicalModel } from "../contracts/model";
import type { IPricingEngine } from "../interfaces/model-registry";

export class DefaultPricingEngine implements IPricingEngine {
  estimateCost(
    model: CanonicalModel,
    inputTokens: number,
    outputTokens: number
  ): Result<number> {
    const inputCost = ((model.pricing.inputPer1kTokens ?? 0) * inputTokens) / 1000;
    const outputCost = ((model.pricing.outputPer1kTokens ?? 0) * outputTokens) / 1000;
    const requestCost = model.pricing.perRequest ?? 0;
    return success(inputCost + outputCost + requestCost);
  }

  comparePricing(models: readonly CanonicalModel[]): Result<readonly CanonicalModel[]> {
    return success(
      [...models].sort(
        (a, b) =>
          (a.pricing.inputPer1kTokens ?? 0) - (b.pricing.inputPer1kTokens ?? 0)
      )
    );
  }
}
