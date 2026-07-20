/**
 * Limits engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { CanonicalModel } from "../contracts/model";
import type { ModelLimits } from "../contracts/limits";
import type { ILimitsEngine } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export class DefaultLimitsEngine implements ILimitsEngine {
  constructor(private readonly store: InMemoryModelRegistryStore) {}

  getLimits(modelId: string): Result<ModelLimits> {
    const model = this.store.getModel(modelId);
    if (!model.ok) return model;
    return success(model.value.limits);
  }

  fitsContext(model: CanonicalModel, tokenCount: number): Result<boolean> {
    return success(tokenCount <= model.limits.maximumContext);
  }
}
