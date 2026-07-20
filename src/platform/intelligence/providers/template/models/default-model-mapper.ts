/**
 * Model mapper — reads from model registry contracts.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError } from "../../../shared/errors";
import type { CanonicalModel } from "../../../model-registry/contracts/model";
import type { IProviderModelMapper } from "../interfaces/provider-template";

export class InMemoryModelMapper implements IProviderModelMapper {
  constructor(private readonly models: readonly CanonicalModel[] = []) {}

  resolveModel(modelId: string): Result<CanonicalModel> {
    const model = this.models.find(
      (m) => String(m.modelId) === modelId || m.aliases?.includes(modelId)
    );
    if (!model) {
      return failure(new NotFoundError(`model not found: ${modelId}`));
    }
    return success(model);
  }

  listModels(): Result<readonly CanonicalModel[]> {
    return success(this.models);
  }
}
