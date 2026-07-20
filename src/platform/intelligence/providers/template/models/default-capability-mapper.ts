/**
 * Capability mapper — projects model registry capabilities.
 */

import { success, type Result } from "../../../shared/result";
import type { CanonicalModel } from "../../../model-registry/contracts/model";
import type { IProviderCapabilityMapper } from "../interfaces/provider-template";

export class DefaultCapabilityMapper implements IProviderCapabilityMapper {
  mapCapabilities(model: CanonicalModel): Result<readonly string[]> {
    return success(model.capabilities.map((c) => c.capabilityId));
  }

  supportsFeature(model: CanonicalModel, feature: string): Result<boolean> {
    const flags = model.flags;
    const map: Record<string, boolean> = {
      streaming: flags.streaming,
      function_calling: flags.functionCalling,
      reasoning: flags.reasoning,
      vision: flags.vision,
      image_generation: flags.imageGeneration,
      embeddings: flags.embeddings,
    };
    return success(map[feature] ?? model.capabilities.some((c) => c.capabilityId === feature));
  }
}
