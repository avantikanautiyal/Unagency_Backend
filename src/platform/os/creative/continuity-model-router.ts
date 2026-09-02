/**
 * Track A Phase A4 — Model router sharpening (no intent rewrite).
 * Pins modality/provider/model only; never mutates the creative brief.
 */

export interface ContinuityRoutingPins {
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
  readonly source: "client" | "refine_reuse" | "capability_default" | "unchanged";
}

/**
 * Merge routing pins for continuity-aware creates.
 * Priority: explicit client req > refine-reuse snapshot > existing metadata.
 */
export function sharpenContinuityRoutingPins(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly reqProviderId?: string;
  readonly reqModelId?: string;
  readonly refineReuse?: boolean;
}): {
  readonly metadata: Record<string, unknown>;
  readonly pins: ContinuityRoutingPins;
} {
  const next: Record<string, unknown> = { ...(input.metadata ?? {}) };
  const clientProvider = input.reqProviderId?.trim();
  const clientModel = input.reqModelId?.trim();

  const metaProvider =
    typeof next.preferredProviderId === "string"
      ? next.preferredProviderId.trim()
      : undefined;
  const metaModel =
    typeof next.preferredModelId === "string"
      ? next.preferredModelId.trim()
      : undefined;

  let source: ContinuityRoutingPins["source"] = "unchanged";
  let preferredProviderId = metaProvider;
  let preferredModelId = metaModel;

  if (clientProvider || clientModel) {
    preferredProviderId = clientProvider || preferredProviderId;
    preferredModelId = clientModel || preferredModelId;
    source = "client";
  } else if (input.refineReuse && (metaProvider || metaModel)) {
    source = "refine_reuse";
  }

  if (preferredProviderId) next.preferredProviderId = preferredProviderId;
  if (preferredModelId) next.preferredModelId = preferredModelId;

  // Explicit: never touch prompt / brief fields.
  return {
    metadata: next,
    pins: {
      preferredProviderId,
      preferredModelId,
      source,
    },
  };
}
