/**
 * Track A Phase A4 — preserve BrandContextPacket across explicit refine re-runs.
 * Never rewrites the brief; never invents assets.
 */

export interface ContinuitySnapshot {
  readonly brandId?: string;
  readonly brandContextPacket?: unknown;
  readonly assetIds?: readonly string[];
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
  readonly capabilityId?: string;
  readonly brandContextProvenance?: string;
  readonly continuityBound?: boolean;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return ids.length ? ids : undefined;
}

/** Pull a continuity snapshot from create/working metadata or extras. */
export function extractContinuitySnapshot(
  source: Readonly<Record<string, unknown>> | undefined
): ContinuitySnapshot | null {
  if (!source) return null;
  const nested =
    source.continuitySnapshot &&
    typeof source.continuitySnapshot === "object" &&
    !Array.isArray(source.continuitySnapshot)
      ? (source.continuitySnapshot as Readonly<Record<string, unknown>>)
      : source;

  const brandId =
    typeof nested.brandId === "string" && nested.brandId.trim()
      ? nested.brandId.trim()
      : undefined;
  const packet = nested.brandContextPacket;
  const assetIds = asStringArray(nested.assetIds);
  const hasPacket =
    Boolean(packet) && typeof packet === "object" && !Array.isArray(packet);

  if (!brandId && !hasPacket && !assetIds?.length) {
    return null;
  }

  return {
    brandId,
    brandContextPacket: hasPacket ? packet : undefined,
    assetIds,
    preferredProviderId:
      typeof nested.preferredProviderId === "string"
        ? nested.preferredProviderId.trim()
        : undefined,
    preferredModelId:
      typeof nested.preferredModelId === "string"
        ? nested.preferredModelId.trim()
        : undefined,
    capabilityId:
      typeof nested.capabilityId === "string"
        ? nested.capabilityId.trim()
        : typeof nested.capabilityHint === "string"
          ? nested.capabilityHint.trim()
          : undefined,
    brandContextProvenance:
      typeof nested.brandContextProvenance === "string"
        ? nested.brandContextProvenance
        : undefined,
    continuityBound: nested.continuityBound === true || hasPacket,
  };
}

/**
 * Metadata for the next thin create after explicit refine.
 * Same packet/assets/routing pins — no prompt compiler.
 */
export function buildRefineContinuityMetadata(input: {
  readonly snapshot: ContinuitySnapshot;
  readonly refinementId?: string;
  readonly sourceExecutionId?: string;
  readonly base?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(input.base ?? {}) };
  if (input.snapshot.brandId) next.brandId = input.snapshot.brandId;
  if (input.snapshot.brandContextPacket) {
    next.brandContextPacket = input.snapshot.brandContextPacket;
  }
  if (input.snapshot.assetIds?.length) {
    next.assetIds = [...input.snapshot.assetIds];
  }
  if (input.snapshot.preferredProviderId) {
    next.preferredProviderId = input.snapshot.preferredProviderId;
  }
  if (input.snapshot.preferredModelId) {
    next.preferredModelId = input.snapshot.preferredModelId;
  }
  if (input.snapshot.brandContextProvenance) {
    next.brandContextProvenance = input.snapshot.brandContextProvenance;
  }
  if (input.snapshot.continuityBound) {
    next.continuityBound = true;
  }
  next.continuityRefineReuse = true;
  if (input.refinementId) next.refinementId = input.refinementId;
  if (input.sourceExecutionId) {
    next.refinedFromExecutionId = input.sourceExecutionId;
  }
  return next;
}

export function continuitySnapshotForExtras(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  const snap = extractContinuitySnapshot(metadata);
  if (!snap) return undefined;
  return { continuitySnapshot: snap };
}
