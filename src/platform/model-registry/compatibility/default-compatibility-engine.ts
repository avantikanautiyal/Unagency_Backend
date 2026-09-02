/**
 * Compatibility engine.
 */

import { success, type Result } from "../../core/result";
import type { CanonicalModel } from "../contracts/model";
import type { ModelCompatibilityProfile } from "../contracts/compatibility";
import type { ICompatibilityEngine } from "../interfaces/model-registry";

export class DefaultCompatibilityEngine implements ICompatibilityEngine {
  profile(model: CanonicalModel): Result<ModelCompatibilityProfile> {
    return success(model.compatibility);
  }

  isCompatible(model: CanonicalModel, capabilityId: string): Result<boolean> {
    return success(
      model.capabilities.some((c) => c.capabilityId === capabilityId && c.supported)
    );
  }
}
