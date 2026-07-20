/**
 * Multi-provider rollout testing helpers.
 */

import {
  createMultiProviderRolloutPlatform,
  type CreateMultiProviderRolloutOptions,
  type MultiProviderRolloutPlatform,
} from "../factories/create-multi-provider-rollout-platform";

export function deterministicRolloutHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-15T00:00:00.000Z",
    clockMs: () => (ms += 3),
  };
}

export function setupMultiProviderRollout(
  options: CreateMultiProviderRolloutOptions = {}
): MultiProviderRolloutPlatform {
  const helpers = deterministicRolloutHelpers();
  return createMultiProviderRolloutPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
