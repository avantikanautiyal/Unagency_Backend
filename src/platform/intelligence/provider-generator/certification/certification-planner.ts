/**
 * Certification planner for generated providers.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderManifestSpec } from "../contracts/manifest";
import type { ICertificationPlanner } from "../interfaces/generator";

export class DefaultCertificationPlanner implements ICertificationPlanner {
  plan(manifest: ProviderManifestSpec): Result<readonly string[]> {
    return success([
      "manifest_validation",
      "capability_validation",
      "health_checks",
      "observability_config",
      "compatibility_report",
      "discovery_smoke",
      "model_resolver_smoke",
      `category_${manifest.category}_checks`,
    ]);
  }
}
