/**
 * Declarative provider reference capabilities — transport vs semantic meaning.
 *
 * Wire field names are NOT semantic roles. Each entry describes what the
 * provider actually interprets when bytes are sent on a given channel.
 */

import type { MultimodalReferenceRole } from "../../../ai/multimodal-context/reference-role";

export type ProviderReferenceSemanticMeaning =
  | "identity_preservation"
  | "identity_guidance"
  | "style_transfer"
  | "composition_guide"
  | "subject_reference"
  | "product_depiction"
  | "neutral_attachment"
  | "prompt_only";

export type ProviderReferenceBehavior =
  | "preserve_identity_mark"
  | "preserve_subject_identity"
  | "transfer_style"
  | "guide_composition"
  | "depict_product"
  | "attach_neutral"
  | "prompt_guidance_only";

export type ProviderReferenceTransportKind =
  | "multipart_file"
  | "json_url_array"
  | "inline_multimodal_part"
  | "edit_image_input"
  | "none";

export type ProviderReferenceTransport = {
  readonly fieldName: string;
  readonly kind: ProviderReferenceTransportKind;
};

export type ProviderReferenceRoleCapability = {
  /** Whether this role may be sent on the wire for this provider. */
  readonly wireSupported: boolean;
  readonly transport?: ProviderReferenceTransport;
  readonly providerSemanticMeaning: ProviderReferenceSemanticMeaning;
  readonly referenceBehavior: ProviderReferenceBehavior;
  readonly preservesIdentity: boolean;
  readonly actsAsStyleTemplate: boolean;
  /**
   * True when canonical semantic meaning is preserved on the wire (not merely
   * documented in prompt text while bytes use a mismatched channel).
   */
  readonly semanticPreservationOnWire: boolean;
  /** When wire is unsupported, bytes may still be omitted with prompt guidance. */
  readonly promptOnlyFallback: boolean;
};

export type ProviderReferenceCapabilitySpec = {
  readonly vendor: string;
  readonly roles: Readonly<
    Record<MultimodalReferenceRole, ProviderReferenceRoleCapability>
  >;
};

function cap(
  partial: Omit<
    ProviderReferenceRoleCapability,
    "preservesIdentity" | "actsAsStyleTemplate" | "semanticPreservationOnWire"
  > &
    Partial<
      Pick<
        ProviderReferenceRoleCapability,
        "preservesIdentity" | "actsAsStyleTemplate" | "semanticPreservationOnWire"
      >
    >,
): ProviderReferenceRoleCapability {
  return {
    preservesIdentity: partial.preservesIdentity ?? false,
    actsAsStyleTemplate: partial.actsAsStyleTemplate ?? false,
    semanticPreservationOnWire: partial.semanticPreservationOnWire ?? false,
    ...partial,
  };
}

const STYLE_STYLE = cap({
  wireSupported: true,
  transport: { fieldName: "style_reference_images", kind: "multipart_file" },
  providerSemanticMeaning: "style_transfer",
  referenceBehavior: "transfer_style",
  actsAsStyleTemplate: true,
  semanticPreservationOnWire: true,
  promptOnlyFallback: false,
});

const STYLE_URL = cap({
  wireSupported: true,
  transport: { fieldName: "style_reference_urls", kind: "json_url_array" },
  providerSemanticMeaning: "style_transfer",
  referenceBehavior: "transfer_style",
  actsAsStyleTemplate: true,
  semanticPreservationOnWire: true,
  promptOnlyFallback: false,
});

const PROMPT_ONLY = cap({
  wireSupported: false,
  providerSemanticMeaning: "prompt_only",
  referenceBehavior: "prompt_guidance_only",
  promptOnlyFallback: true,
});

const INLINE_NEUTRAL = cap({
  wireSupported: true,
  transport: { fieldName: "inlineData", kind: "inline_multimodal_part" },
  providerSemanticMeaning: "neutral_attachment",
  referenceBehavior: "attach_neutral",
  semanticPreservationOnWire: true,
  promptOnlyFallback: false,
});

/** Ideogram v3 — character_reference_images preserves identity; style_reference_images transfers style. */
export const IDEOGRAM_REFERENCE_CAPABILITIES: ProviderReferenceCapabilitySpec =
  Object.freeze({
    vendor: "ideogram",
    roles: Object.freeze({
      identity_mark: cap({
        wireSupported: true,
        transport: {
          fieldName: "character_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "identity_preservation",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
        actsAsStyleTemplate: false,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      identity_reference: cap({
        wireSupported: true,
        transport: {
          fieldName: "character_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "identity_guidance",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
        actsAsStyleTemplate: false,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      style_reference: STYLE_STYLE,
      composition_reference: cap({
        wireSupported: true,
        transport: {
          fieldName: "style_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "composition_guide",
        referenceBehavior: "guide_composition",
        actsAsStyleTemplate: false,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      product_reference: cap({
        wireSupported: true,
        transport: {
          fieldName: "character_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "product_depiction",
        referenceBehavior: "depict_product",
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      subject_reference: cap({
        wireSupported: true,
        transport: {
          fieldName: "character_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "subject_reference",
        referenceBehavior: "preserve_subject_identity",
        preservesIdentity: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      texture_material_reference: STYLE_STYLE,
      generic_reference: cap({
        wireSupported: true,
        transport: {
          fieldName: "character_reference_images",
          kind: "multipart_file",
        },
        providerSemanticMeaning: "neutral_attachment",
        referenceBehavior: "attach_neutral",
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
    }),
  });

/** Recraft — style_reference_urls only; identity roles are prompt-only. */
export const RECRAFT_REFERENCE_CAPABILITIES: ProviderReferenceCapabilitySpec =
  Object.freeze({
    vendor: "recraft",
    roles: Object.freeze({
      identity_mark: PROMPT_ONLY,
      identity_reference: PROMPT_ONLY,
      style_reference: STYLE_URL,
      composition_reference: STYLE_URL,
      product_reference: PROMPT_ONLY,
      subject_reference: PROMPT_ONLY,
      texture_material_reference: STYLE_URL,
      generic_reference: STYLE_URL,
    }),
  });

/** Google Gemini image — neutral inline part; semantics from prompt guidance. */
export const GOOGLE_GEMINI_IMAGE_REFERENCE_CAPABILITIES: ProviderReferenceCapabilitySpec =
  Object.freeze({
    vendor: "google_gemini_image",
    roles: Object.freeze({
      identity_mark: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "identity_preservation",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
      }),
      identity_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "identity_guidance",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
      }),
      style_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "style_transfer",
        referenceBehavior: "transfer_style",
        actsAsStyleTemplate: true,
      }),
      composition_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "composition_guide",
        referenceBehavior: "guide_composition",
      }),
      product_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "product_depiction",
        referenceBehavior: "depict_product",
      }),
      subject_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "subject_reference",
        referenceBehavior: "preserve_subject_identity",
        preservesIdentity: true,
      }),
      texture_material_reference: cap({
        ...INLINE_NEUTRAL,
        providerSemanticMeaning: "style_transfer",
        referenceBehavior: "transfer_style",
        actsAsStyleTemplate: true,
      }),
      generic_reference: INLINE_NEUTRAL,
    }),
  });

/** OpenAI gpt-image edits — high-fidelity edit input treats refs as identity-preserving. */
export const OPENAI_IMAGE_REFERENCE_CAPABILITIES: ProviderReferenceCapabilitySpec =
  Object.freeze({
    vendor: "openai",
    roles: Object.freeze({
      identity_mark: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "identity_preservation",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      identity_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "identity_guidance",
        referenceBehavior: "preserve_identity_mark",
        preservesIdentity: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      style_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "style_transfer",
        referenceBehavior: "transfer_style",
        actsAsStyleTemplate: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      composition_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "composition_guide",
        referenceBehavior: "guide_composition",
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      product_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "product_depiction",
        referenceBehavior: "depict_product",
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      subject_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "subject_reference",
        referenceBehavior: "preserve_subject_identity",
        preservesIdentity: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      texture_material_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "style_transfer",
        referenceBehavior: "transfer_style",
        actsAsStyleTemplate: true,
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
      generic_reference: cap({
        wireSupported: true,
        transport: { fieldName: "image", kind: "edit_image_input" },
        providerSemanticMeaning: "neutral_attachment",
        referenceBehavior: "attach_neutral",
        semanticPreservationOnWire: true,
        promptOnlyFallback: false,
      }),
    }),
  });

const REGISTRY: Readonly<Record<string, ProviderReferenceCapabilitySpec>> =
  Object.freeze({
    ideogram: IDEOGRAM_REFERENCE_CAPABILITIES,
    recraft: RECRAFT_REFERENCE_CAPABILITIES,
    google_gemini_image: GOOGLE_GEMINI_IMAGE_REFERENCE_CAPABILITIES,
    openai: OPENAI_IMAGE_REFERENCE_CAPABILITIES,
  });

export function resolveProviderReferenceCapabilitySpec(
  vendor: string,
): ProviderReferenceCapabilitySpec | undefined {
  const key = vendor.trim().toLowerCase();
  return REGISTRY[key];
}

export function resolveProviderReferenceRoleCapability(input: {
  readonly vendor: string;
  readonly role: MultimodalReferenceRole;
}): ProviderReferenceRoleCapability | undefined {
  const spec = resolveProviderReferenceCapabilitySpec(input.vendor);
  return spec?.roles[input.role];
}

export type ProviderReferenceWireAdaptation = {
  readonly canonicalRole: MultimodalReferenceRole;
  readonly capability: ProviderReferenceRoleCapability;
  readonly deliverBytes: boolean;
  readonly promptGuidance: string;
  readonly providerTransport?: ProviderReferenceTransport;
  readonly providerSemanticMeaning: ProviderReferenceSemanticMeaning;
  readonly referenceBehavior: ProviderReferenceBehavior;
  readonly semanticPreservationOnWire: boolean;
  readonly wireFieldIsTransportOnly: boolean;
  readonly mappingExplicitlyUnsupported: boolean;
};
