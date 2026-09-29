/**
 * Canonical multimodal / image-reference semantic roles.
 *
 * Distinguishes WHY an image is attached from WHAT it contains or which
 * provider wire field transports the bytes. No provider-specific meaning.
 *
 * Authority order (mandatory):
 *   1. explicit semantic role (caller)
 *   2. CTI / BrandAssetRequirementSpec role (brandAssetRole)
 *   3. persisted authoritative asset semantic role (semanticReferenceRole / referenceRole)
 *   4. declarative metadata mapping only when part of the semantic contract
 *   5. otherwise undefined
 *
 * NEVER infer role from referenceInputType, vault provenance, MIME, filename,
 * asset id shape, or transport class.
 */

export const MULTIMODAL_REFERENCE_ROLES = [
  "identity_mark",
  "identity_reference",
  "style_reference",
  "composition_reference",
  "product_reference",
  "subject_reference",
  "texture_material_reference",
  "generic_reference",
] as const;

export type MultimodalReferenceRole =
  (typeof MULTIMODAL_REFERENCE_ROLES)[number];

export function isMultimodalReferenceRole(
  value: unknown,
): value is MultimodalReferenceRole {
  return (
    typeof value === "string" &&
    (MULTIMODAL_REFERENCE_ROLES as readonly string[]).includes(value)
  );
}

export type ReferenceRoleResolutionSource =
  | "explicit_role"
  | "persisted_semantic_reference_role"
  | "persisted_reference_role"
  | "cti_brand_asset_role"
  | "authoritative_brand_logo_relation"
  | "declared_product_input_role"
  | "absent";

export type ResolvedCanonicalReferenceRole = {
  readonly role: MultimodalReferenceRole | undefined;
  readonly source: ReferenceRoleResolutionSource;
};

/**
 * Resolve canonical reference role from semantic authorities only.
 * Does not invent roles from provenance / transport / MIME / filename.
 */
export function resolveMultimodalReferenceRole(input: {
  readonly explicitRole?: unknown;
  readonly semanticReferenceRole?: unknown;
  readonly referenceRole?: unknown;
  /** CTI BrandAssetRequirementSpec.role — semantic, not provenance. */
  readonly brandAssetRole?: unknown;
}): MultimodalReferenceRole | undefined {
  return resolveCanonicalReferenceRoleWithSource(input).role;
}

/**
 * Same authority order as resolveMultimodalReferenceRole, with source provenance
 * for observability (canonical role ≠ vendor transport field).
 */
export function resolveCanonicalReferenceRoleWithSource(input: {
  readonly explicitRole?: unknown;
  readonly semanticReferenceRole?: unknown;
  readonly referenceRole?: unknown;
  readonly brandAssetRole?: unknown;
  /**
   * Authoritative execution logo bind: asset id equals logoAssetId / brandLogoAssetId.
   * Not inferred from vault provenance or filename.
   */
  readonly matchesAuthoritativeBrandLogoRelation?: boolean;
  /** Declared product/input role when part of the semantic contract. */
  readonly declaredProductInputRole?: unknown;
}): ResolvedCanonicalReferenceRole {
  if (isMultimodalReferenceRole(input.explicitRole)) {
    return { role: input.explicitRole, source: "explicit_role" };
  }
  if (isMultimodalReferenceRole(input.semanticReferenceRole)) {
    return {
      role: input.semanticReferenceRole,
      source: "persisted_semantic_reference_role",
    };
  }
  if (isMultimodalReferenceRole(input.referenceRole)) {
    return {
      role: input.referenceRole,
      source: "persisted_reference_role",
    };
  }

  const brandRole =
    typeof input.brandAssetRole === "string"
      ? input.brandAssetRole.trim().toLowerCase()
      : "";
  if (brandRole === "logo" || brandRole === "brand_mark") {
    return { role: "identity_mark", source: "cti_brand_asset_role" };
  }
  if (brandRole === "reference") {
    return { role: "generic_reference", source: "cti_brand_asset_role" };
  }

  if (input.matchesAuthoritativeBrandLogoRelation === true) {
    return {
      role: "identity_mark",
      source: "authoritative_brand_logo_relation",
    };
  }

  const declared =
    typeof input.declaredProductInputRole === "string"
      ? input.declaredProductInputRole.trim().toLowerCase()
      : "";
  if (declared === "logo" || declared === "brand_mark") {
    return {
      role: "identity_mark",
      source: "declared_product_input_role",
    };
  }
  if (isMultimodalReferenceRole(input.declaredProductInputRole)) {
    return {
      role: input.declaredProductInputRole,
      source: "declared_product_input_role",
    };
  }

  return { role: undefined, source: "absent" };
}

/**
 * Whether a vendor "style reference" transport channel is semantically
 * appropriate for this role. Identity marks must not be treated as style.
 */
export function roleAllowsStyleReferenceChannel(
  role: MultimodalReferenceRole,
): boolean {
  return (
    role === "style_reference" ||
    role === "composition_reference" ||
    role === "texture_material_reference"
  );
}

/** Prompt guidance that preserves role meaning at the model boundary. */
export function promptGuidanceForReferenceRole(
  role: MultimodalReferenceRole,
): string {
  switch (role) {
    case "identity_mark":
      // Transport/role guidance only — must not redefine deliverable or creative authority.
      // Authoritative hierarchy lives in CMR (DELIVERABLE COMPOSITION, user instruction, direction).
      return (
        "REFERENCE ROLE = identity_mark: An authoritative brand identity mark is attached. " +
        "Incorporate that exact artwork as a subordinate brand signature in the layout. " +
        "Preserve recognizable identity. It is not the primary visual concept. " +
        "Do not invent a different mark. Do not treat the mark as the full composition, " +
        "dominant subject, or stylistic template of the creative. " +
        "Do not derive the entire visual style from the mark. " +
        "Place it according to the authoritative composition hierarchy already specified " +
        "in the labeled request (deliverable composition / selected direction)."
      );
    case "identity_reference":
      return (
        "REFERENCE ROLE = identity_reference: Use the attached image as brand-identity " +
        "guidance (colors, mark recognition, lockup cues). Keep identity recognizable; " +
        "do not copy the reference as the entire creative composition."
      );
    case "style_reference":
      return (
        "REFERENCE ROLE = style_reference: Use the attached image as stylistic guidance " +
        "(mood, palette, rendering), not as the literal subject to reproduce."
      );
    case "composition_reference":
      return (
        "REFERENCE ROLE = composition_reference: Use the attached image as layout / " +
        "composition guidance."
      );
    case "product_reference":
      return (
        "REFERENCE ROLE = product_reference: The attached image is the product to depict " +
        "faithfully (form, labeling cues) within the creative."
      );
    case "subject_reference":
      return (
        "REFERENCE ROLE = subject_reference: The attached image is the authoritative " +
        "primary subject / SOURCE ASSET. Preserve its essential identity, geometry, and " +
        "recognizable construction. Do not invent a substitute subject or a new creative " +
        "direction that replaces it. Adapt, systematize, or apply it only as the labeled " +
        "request requires."
      );
    case "texture_material_reference":
      return (
        "REFERENCE ROLE = texture_material_reference: Use the attached image for " +
        "texture / material appearance guidance."
      );
    case "generic_reference":
    default:
      return (
        "REFERENCE ROLE = generic_reference: An image reference is attached — use it " +
        "according to the creative direction; do not invent a conflicting substitute."
      );
  }
}

/**
 * Provider-boundary plan: preserves canonical role even when wire fields differ.
 * Wire field names are transport only — they do not redefine semantics.
 */
export type ImageReferenceAdaptationPlan = {
  readonly canonicalRole: MultimodalReferenceRole;
  /** True when a style-reference wire channel may carry bytes for this role. */
  readonly useStyleReferenceChannel: boolean;
  /** True when bytes should still be delivered when the provider has no better channel. */
  readonly deliverBytes: boolean;
  readonly promptGuidance: string;
  /**
   * When the only available wire field is named like a style reference but the
   * canonical role is not style — transport ≠ semantic reclassification.
   */
  readonly wireFieldIsTransportOnly: boolean;
  /** What the provider is expected to interpret the attachment as. */
  readonly providerSemanticMeaning?: string;
  readonly referenceBehavior?: string;
  /** True when wire semantics match canonical role (not prompt-only workaround). */
  readonly semanticPreservationOnWire?: boolean;
  /** Provider lacks a correct wire channel — bytes omitted, limitation explicit. */
  readonly mappingExplicitlyUnsupported?: boolean;
};

/** Observability snapshot: canonical role vs vendor transport. */
export type ProviderReferenceRoleObservability = {
  readonly canonicalReferenceRole?: MultimodalReferenceRole;
  readonly referenceRoleResolutionSource?: string;
  readonly providerReferenceAdaptation?: string;
  readonly providerReferenceTransport?: string;
  readonly providerSemanticMeaning?: string;
  readonly referenceBehavior?: string;
  readonly providerReferenceRolePreserved?: boolean;
  readonly mappingExplicitlyUnsupported?: boolean;
};

export function planImageReferenceAdaptation(
  role: MultimodalReferenceRole,
): ImageReferenceAdaptationPlan {
  const useStyle = roleAllowsStyleReferenceChannel(role);
  return {
    canonicalRole: role,
    useStyleReferenceChannel: useStyle,
    deliverBytes: true,
    promptGuidance: promptGuidanceForReferenceRole(role),
    wireFieldIsTransportOnly: !useStyle,
  };
}

export function buildProviderReferenceRoleObservability(input: {
  readonly canonicalRole?: MultimodalReferenceRole;
  readonly resolutionSource?: string;
  readonly transportFieldName?: string;
  readonly adaptations?: readonly ImageReferenceAdaptationPlan[];
}): ProviderReferenceRoleObservability {
  const role = input.canonicalRole ?? input.adaptations?.[0]?.canonicalRole;
  const primary = input.adaptations?.[0];
  const preserved = Boolean(
    role &&
      primary?.canonicalRole === role &&
      primary.semanticPreservationOnWire === true &&
      primary.mappingExplicitlyUnsupported !== true,
  );
  return {
    ...(role ? { canonicalReferenceRole: role } : {}),
    ...(input.resolutionSource
      ? { referenceRoleResolutionSource: input.resolutionSource }
      : {}),
    ...(role ? { providerReferenceAdaptation: `${role}_guidance` } : {}),
    ...(input.transportFieldName
      ? { providerReferenceTransport: input.transportFieldName }
      : {}),
    ...(primary?.providerSemanticMeaning
      ? { providerSemanticMeaning: primary.providerSemanticMeaning }
      : {}),
    ...(primary?.referenceBehavior
      ? { referenceBehavior: primary.referenceBehavior }
      : {}),
    ...(primary?.mappingExplicitlyUnsupported
      ? { mappingExplicitlyUnsupported: true }
      : {}),
    ...(role != null ? { providerReferenceRolePreserved: preserved } : {}),
  };
}
