/**
 * Default preference resolver.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingCandidate } from "../contracts/candidate";
import type { RoutingPreferences } from "../contracts/request";
import type { IRoutingPreferenceResolver } from "../interfaces/routing";

export class DefaultPreferenceResolver implements IRoutingPreferenceResolver {
  resolve(
    candidates: readonly RoutingCandidate[],
    preferences?: RoutingPreferences
  ): Result<readonly RoutingCandidate[]> {
    if (!preferences) return success(candidates);

    let filtered = candidates;
    if (preferences.excludedProviders?.length) {
      const excluded = new Set(preferences.excludedProviders.map(String));
      filtered = filtered.filter((c) => !excluded.has(String(c.providerId)));
    }
    if (preferences.region) {
      filtered = filtered.filter(
        (c) => !c.region || c.region === preferences.region
      );
    }
    return success(filtered);
  }
}
