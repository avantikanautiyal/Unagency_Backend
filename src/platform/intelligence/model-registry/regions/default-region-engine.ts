/**
 * Region engine.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../contracts/model";
import type { ModelRegion } from "../contracts/regions";
import type { IRegionEngine } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export class DefaultRegionEngine implements IRegionEngine {
  constructor(private readonly store: InMemoryModelRegistryStore) {}

  getRegions(modelId: string): Result<readonly ModelRegion[]> {
    const model = this.store.getModel(modelId);
    if (!model.ok) return model;
    return success(model.value.regions);
  }

  isAvailableInRegion(model: CanonicalModel, regionId: string): Result<boolean> {
    const region = model.regions.find((r) => r.regionId === regionId);
    return success(region?.availability === "available");
  }
}
