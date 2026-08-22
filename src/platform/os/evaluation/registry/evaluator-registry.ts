/**
 * Evaluator registry — pluggable, versioned evaluators.
 */

import type { IEvaluator } from "../contracts/evaluation-result";
import { EvaluationError } from "../contracts/errors";
import { SpecGuardEvaluator } from "../evaluators/spec-guard";
import { BrandGuardEvaluator } from "../evaluators/brand-guard";
import { QualityEvaluator } from "../evaluators/quality-evaluator";

export class EvaluatorRegistry {
  private readonly byId = new Map<string, IEvaluator>();

  register(evaluator: IEvaluator): void {
    this.byId.set(evaluator.evaluatorId, evaluator);
  }

  get(evaluatorId: string): IEvaluator {
    const e = this.byId.get(evaluatorId);
    if (!e) {
      throw new EvaluationError(
        "EVALUATOR_NOT_FOUND",
        `Evaluator not registered: ${evaluatorId}`
      );
    }
    return e;
  }

  list(): readonly IEvaluator[] {
    return [...this.byId.values()];
  }

  has(evaluatorId: string): boolean {
    return this.byId.has(evaluatorId);
  }
}

export function createDefaultEvaluatorRegistry(): EvaluatorRegistry {
  const registry = new EvaluatorRegistry();
  registry.register(new SpecGuardEvaluator());
  registry.register(new BrandGuardEvaluator());
  registry.register(new QualityEvaluator());
  return registry;
}
