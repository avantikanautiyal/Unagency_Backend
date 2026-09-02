/**
 * Preference resolution helpers.
 *
 * Purpose: Interpret caller ExecutionPreferences into ordering hints.
 * Responsibilities: Normalize weights; expose preferred provider/model, if any.
 * Usage: Used by the engine to rank fallback candidates.
 * Future Extension: Multi-objective optimization.
 */

import type { ExecutionPreference } from "../contracts/negotiation-request";
import type { PreferenceKind } from "../contracts/enums";

export interface ResolvedPreferences {
  readonly weights: Readonly<Record<PreferenceKind, number>>;
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
}

const DEFAULT_WEIGHTS: Readonly<Record<PreferenceKind, number>> = {
  latency: 0.25,
  cost: 0.25,
  quality: 0.25,
  provider: 0.15,
  model: 0.1,
};

export function resolvePreferences(
  preferences: readonly ExecutionPreference[] | undefined
): ResolvedPreferences {
  if (!preferences || preferences.length === 0) {
    return { weights: DEFAULT_WEIGHTS };
  }

  const weights: Record<PreferenceKind, number> = { ...DEFAULT_WEIGHTS };
  let preferredProviderId: string | undefined;
  let preferredModelId: string | undefined;

  for (const preference of preferences) {
    if (typeof preference.weight === "number") {
      weights[preference.kind] = preference.weight;
    }
    if (preference.kind === "provider" && preference.value) {
      preferredProviderId = preference.value;
    }
    if (preference.kind === "model" && preference.value) {
      preferredModelId = preference.value;
    }
  }

  return { weights, preferredProviderId, preferredModelId };
}
