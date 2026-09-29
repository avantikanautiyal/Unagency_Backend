/**
 * Generic deliverable semantics from phase/output contract + product grounding.
 * No serviceId / phaseId / platform special-cases — humanizes declared fields only.
 */

export type DeliverableSemanticsInput = {
  readonly deliverableLabel?: string | null;
  readonly phaseName?: string | null;
  readonly artifactKey?: string | null;
  readonly generationModality?: string | null;
  readonly outputKind?: string | null;
  readonly productGrounding?: {
    readonly platform?: string | null;
    readonly format?: string | null;
    readonly category?: string | null;
    readonly subtype?: string | null;
    readonly service?: string | null;
  } | null;
  /** Coarse service-map example — used only when no concrete grounding exists. */
  readonly fallbackExampleDeliverable?: string | null;
};

export type DeliverableSemantics = {
  /** Explicit imperative statement for the provider. */
  readonly statement: string;
  /** Short concrete noun phrase (e.g. "Instagram Feed Post"). */
  readonly concreteLabel: string;
  readonly platform?: string;
  readonly format?: string;
  readonly modality?: string;
  readonly source: "product_grounding_and_contract" | "phase_contract" | "service_map_fallback";
};

function humanizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/[_/]+/g, " ")
    .replace(/-+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Compose contract-resolved deliverable semantics for CMR / provider projection.
 */
export function composeDeliverableSemantics(
  input: DeliverableSemanticsInput,
): DeliverableSemantics {
  const platform =
    typeof input.productGrounding?.platform === "string" &&
    input.productGrounding.platform.trim()
      ? humanizeToken(input.productGrounding.platform)
      : undefined;
  const format =
    typeof input.productGrounding?.format === "string" &&
    input.productGrounding.format.trim()
      ? humanizeToken(input.productGrounding.format)
      : undefined;
  const modality =
    typeof input.generationModality === "string" &&
    input.generationModality.trim()
      ? input.generationModality.trim()
      : typeof input.outputKind === "string" && input.outputKind.trim()
        ? input.outputKind.trim()
        : undefined;

  const phaseLabel =
    (typeof input.deliverableLabel === "string" &&
      input.deliverableLabel.trim()) ||
    (typeof input.phaseName === "string" && input.phaseName.trim()) ||
    undefined;

  if (platform || format) {
    const concreteParts = [platform, format].filter(Boolean) as string[];
    const concreteLabel = concreteParts.join(" ");
    const statement = [
      `Create a finished ${concreteLabel}`,
      phaseLabel && phaseLabel.toLowerCase() !== concreteLabel.toLowerCase()
        ? `(${phaseLabel})`
        : null,
      "for the selected brand.",
      modality ? `Output modality: ${modality}.` : null,
      "Follow the selected creative direction, brand context, and identity-mark role.",
      "Production constraints are technical only — not the creative concept.",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      statement,
      concreteLabel,
      ...(platform ? { platform } : {}),
      ...(format ? { format } : {}),
      ...(modality ? { modality } : {}),
      source: "product_grounding_and_contract",
    };
  }

  if (phaseLabel) {
    const statement = [
      `Create a finished ${phaseLabel} for the selected brand.`,
      modality ? `Output modality: ${modality}.` : null,
      "Follow the selected creative direction, brand context, and identity-mark role.",
      "Production constraints are technical only — not the creative concept.",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      statement,
      concreteLabel: phaseLabel,
      ...(modality ? { modality } : {}),
      source: "phase_contract",
    };
  }

  const fallback =
    (typeof input.fallbackExampleDeliverable === "string" &&
      input.fallbackExampleDeliverable.trim()) ||
    "Create the requested deliverable for the selected brand.";
  return {
    statement: fallback.startsWith("Create ")
      ? fallback
      : `Create a finished ${fallback}.`,
    concreteLabel: fallback,
    ...(modality ? { modality } : {}),
    source: "service_map_fallback",
  };
}
