/**
 * Capability mapping planner — canonical capabilities from matrix.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderManifestSpec } from "../contracts/manifest";
import type { ICapabilityMapperPlanner } from "../interfaces/generator";

export class DefaultCapabilityMapperPlanner implements ICapabilityMapperPlanner {
  plan(manifest: ProviderManifestSpec): Result<readonly string[]> {
    return success(manifest.capabilityMatrix.map((e) => e.capabilityId));
  }
}
