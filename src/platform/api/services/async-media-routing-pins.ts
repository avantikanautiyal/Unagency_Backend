/**
 * Async media routing pin resolution — prepass owns pins (Wave 3).
 */

export type AsyncMediaRoutingPins = {
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
  readonly prepassPinned: boolean;
};

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve provider/model for async media.
 * Precedence: req fields → workingMetadata preferred* → metadata preferred* → metadata providerId/modelId.
 */
export function resolveAsyncMediaRoutingPins(input: {
  readonly reqProviderId?: string;
  readonly reqModelId?: string;
  readonly workingMetadata?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): AsyncMediaRoutingPins {
  const preferredProviderId =
    trimString(input.reqProviderId) ||
    trimString(input.workingMetadata?.preferredProviderId) ||
    trimString(input.metadata?.preferredProviderId) ||
    trimString(input.metadata?.providerId);
  const preferredModelId =
    trimString(input.reqModelId) ||
    trimString(input.workingMetadata?.preferredModelId) ||
    trimString(input.metadata?.preferredModelId) ||
    trimString(input.metadata?.modelId);
  return {
    preferredProviderId,
    preferredModelId,
    prepassPinned: Boolean(preferredProviderId && preferredModelId),
  };
}

export function failoverChainFromMetadata(
  metadata?: Readonly<Record<string, unknown>>
): { providerId: string; modelId: string }[] {
  const raw = metadata?.imageFailoverChain ?? metadata?.failoverChain;
  if (!Array.isArray(raw)) return [];
  const out: { providerId: string; modelId: string }[] = [];
  for (const step of raw) {
    if (!step || typeof step !== "object") continue;
    const providerId = trimString((step as { providerId?: unknown }).providerId);
    const modelId = trimString((step as { modelId?: unknown }).modelId);
    if (!providerId || !modelId) continue;
    out.push({ providerId, modelId });
  }
  return out;
}
