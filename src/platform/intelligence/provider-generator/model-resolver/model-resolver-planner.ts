/**
 * Model resolver planner — documents resolveModel() contract for generators.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderManifestSpec } from "../contracts/manifest";
import type { IModelResolverPlanner } from "../interfaces/generator";

export class DefaultModelResolverPlanner implements IModelResolverPlanner {
  plan(manifest: ProviderManifestSpec): Result<Readonly<Record<string, unknown>>> {
    return success({
      method: "resolveModel",
      inputs: [
        "capability",
        "modality",
        "contextWindow",
        "reasoning",
        "latency",
        "budget",
        "region",
        "toolCalling",
        "structuredOutputs",
        "streaming",
        "vision",
        "audio",
        "image",
        "video",
      ],
      neverExposeModelNamesToBusinessModules: true,
      discoverModelsFirst: true,
      features: manifest.features,
      category: manifest.category,
    });
  }
}
