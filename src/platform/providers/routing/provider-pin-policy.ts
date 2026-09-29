/**
 * Provider pin policy — routing contract for how a caller-named provider binds.
 *
 * - preferred (default): the named provider is tried first; declared failover
 *   may substitute another provider (fallback identity is recorded).
 * - required: the named provider must serve the execution. Same-provider model
 *   alternates are allowed; another provider is never substituted — failure of
 *   the pinned provider is the execution's failure.
 *
 * Generic for every provider. Fanout leaves express the same no-substitution
 * rule via disableCrossProviderFailover.
 */

export type ProviderPinPolicy = "preferred" | "required";

type Meta = Readonly<Record<string, unknown>> | null | undefined;

export function parseProviderPinPolicy(value: unknown): ProviderPinPolicy {
  return value === "required" ? "required" : "preferred";
}

/** Metadata stamps for a required pin (empty when policy is preferred). */
export function providerPinMetadataStamps(input: {
  readonly policy: ProviderPinPolicy;
  readonly pinnedProviderId?: string;
}): Record<string, unknown> {
  const provider = input.pinnedProviderId?.trim();
  if (input.policy !== "required" || !provider) return {};
  return { providerPinPolicy: "required", pinnedProviderId: provider };
}

/** Provider that must serve this execution, when a required pin is stamped. */
export function requiredPinnedProvider(metadata: Meta): string | undefined {
  if (!metadata || metadata.providerPinPolicy !== "required") return undefined;
  const p = metadata.pinnedProviderId;
  return typeof p === "string" && p.trim() ? p.trim() : undefined;
}

/**
 * Apply the pin policy to an ordered candidate list: a required pin keeps only
 * the pinned provider's candidates (order preserved).
 */
export function applyProviderPinPolicy<
  T extends { readonly providerId: string },
>(candidates: readonly T[], metadata: Meta): {
  readonly candidates: readonly T[];
  readonly pinnedProviderId?: string;
  readonly removed: readonly T[];
} {
  const pinned = requiredPinnedProvider(metadata);
  if (!pinned) return { candidates, removed: [] };
  return {
    candidates: candidates.filter((c) => c.providerId === pinned),
    pinnedProviderId: pinned,
    removed: candidates.filter((c) => c.providerId !== pinned),
  };
}
