/**
 * Lifecycle manager.
 */

import { failure, success, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { ModelLifecycleState } from "../contracts/enums";
import type { ModelLifecycle } from "../contracts/lifecycle";
import type { IModelLifecycleManager } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";
import { DefaultModelValidationEngine } from "../validation/default-validation-engine";

export class DefaultModelLifecycleManager implements IModelLifecycleManager {
  private readonly validator = new DefaultModelValidationEngine();

  constructor(private readonly store: InMemoryModelRegistryStore) {}

  getLifecycle(modelId: string): Result<ModelLifecycle> {
    const model = this.store.getModel(modelId);
    if (!model.ok) return model;
    return success(model.value.lifecycle);
  }

  canTransition(from: ModelLifecycleState, to: ModelLifecycleState): Result<boolean> {
    return success(this.validator.canTransition(from, to));
  }
}
