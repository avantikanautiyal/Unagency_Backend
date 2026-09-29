/**
 * Phase 12 — Deterministic CMR → provider representation assessment.
 * Does NOT query storage, conversation DB, artifacts, or mutate CMR semantics.
 */

import {
  extractCanonicalMultimodalProviderHandoff,
  type CanonicalModelRequest,
} from "../canonical-model-request";
import { listReferenceImageProviderIds } from "../../providers/image/configs/image-provider-capabilities";
import { resolveCmrProviderRepresentationProfile } from "./provider-profile";
import type {
  CmrComponentName,
  ProviderRepresentationComponent,
  ProviderRepresentationPlan,
} from "./representation-plan";
import { PROVIDER_REPRESENTATION_PLAN_SOURCE } from "./representation-plan";
import type { ModelRuntimeCapabilityNote } from "./types";

/** Inventory-backed: provider can attach reference images via image adapters (not Phase 9A CMR parts). */
function providerSupportsAdapterMediatedReferenceImage(
  providerId: string | undefined,
): boolean {
  const id = String(providerId ?? "").trim();
  if (!id) return false;
  return listReferenceImageProviderIds().includes(id);
}

function hasStructured(
  modelRequest: CanonicalModelRequest,
  name: string,
): boolean {
  return modelRequest.messages.some((m) =>
    m.content.some((p) => p.type === "structured" && p.name === name),
  );
}

function hasTextRole(
  modelRequest: CanonicalModelRequest,
  role: string,
): boolean {
  return modelRequest.messages.some((m) =>
    m.content.some(
      (p) => p.type === "text" && p.semanticRole === role && Boolean(p.text?.trim()),
    ),
  );
}

function inventoryPresent(
  modelRequest: CanonicalModelRequest,
): Record<CmrComponentName, boolean> {
  return {
    current_user_instruction: hasTextRole(modelRequest, "current_user_instruction"),
    current_task: hasStructured(modelRequest, "current_task"),
    requirements: hasStructured(modelRequest, "requirements"),
    constraints: hasStructured(modelRequest, "constraints"),
    exclusions: hasStructured(modelRequest, "exclusions"),
    selections: hasStructured(modelRequest, "selections"),
    approved_decisions: hasStructured(modelRequest, "approved_decisions"),
    resolved_references: hasStructured(modelRequest, "resolved_references"),
    working_memory: hasStructured(modelRequest, "working_memory"),
    multimodal_context: hasStructured(modelRequest, "multimodal_context"),
    multimodal_provider_deliveries: Boolean(
      modelRequest.multimodalProviderDeliveries?.length,
    ),
    active_brief: hasStructured(modelRequest, "active_brief"),
    cdf_context: hasStructured(modelRequest, "cdf_context"),
    upstream_artifact:
      hasStructured(modelRequest, "upstream_artifact") ||
      hasStructured(modelRequest, "upstream_artifacts_empty"),
    production_spec: hasStructured(modelRequest, "production_spec"),
    output_contract: hasStructured(modelRequest, "output_contract"),
    output_requirements: hasStructured(modelRequest, "output_requirements"),
    authority: hasStructured(modelRequest, "authority"),
  };
}

/**
 * Build a provider-neutral representation plan for a CMR + selected provider.
 */
export function buildProviderRepresentationPlan(input: {
  readonly modelRequest: CanonicalModelRequest;
  readonly providerId?: string;
  readonly modelId?: string;
}): ProviderRepresentationPlan {
  const profile = resolveCmrProviderRepresentationProfile(input.providerId);
  const present = inventoryPresent(input.modelRequest);
  const components: ProviderRepresentationComponent[] = [];
  const capabilities: ModelRuntimeCapabilityNote[] = [];

  const textViaCompat = (
    component: CmrComponentName,
    required: boolean,
  ): ProviderRepresentationComponent => {
    if (!present[component]) {
      return {
        component,
        presentInCmr: false,
        status: "OMITTED_WITH_REASON",
        reason: "not_present_in_cmr",
        required: false,
      };
    }
    if (!profile.compatibilityFlatten) {
      return {
        component,
        presentInCmr: true,
        status: "REQUIRED_BUT_UNREPRESENTABLE",
        reason: "provider_lacks_text_compatibility_flatten",
        required,
      };
    }
    return {
      component,
      presentInCmr: true,
      status: "SUPPORTED_VIA_COMPATIBILITY",
      strategy: "cmr_compatibility_flatten",
      required,
    };
  };

  // Authoritative text/context sections → compatibility flatten on current transports.
  const textSections: Array<{ name: CmrComponentName; required: boolean }> = [
    { name: "current_user_instruction", required: true },
    { name: "current_task", required: false },
    { name: "requirements", required: false },
    { name: "constraints", required: false },
    { name: "exclusions", required: false },
    { name: "selections", required: false },
    { name: "approved_decisions", required: false },
    { name: "resolved_references", required: false },
    { name: "working_memory", required: false },
    { name: "active_brief", required: false },
    { name: "cdf_context", required: false },
    { name: "upstream_artifact", required: false },
    { name: "production_spec", required: false },
    { name: "output_contract", required: false },
    { name: "output_requirements", required: false },
    { name: "authority", required: false },
  ];

  for (const s of textSections) {
    const c = textViaCompat(s.name, s.required);
    components.push(c);
    capabilities.push({
      feature: s.name,
      state: c.status,
      reason: c.reason,
    });
  }

  // Multimodal: Phase 9A native handoff vs explicit omission (no Gemini expansion).
  const handoff = extractCanonicalMultimodalProviderHandoff(input.modelRequest, {
    supportsImageInput: profile.nativeCanonicalImageHandoff,
  });

  if (!present.multimodal_context) {
    components.push({
      component: "multimodal_context",
      presentInCmr: false,
      status: "OMITTED_WITH_REASON",
      reason: "not_present_in_cmr",
      required: false,
    });
    capabilities.push({
      feature: "multimodal_context",
      state: "OMITTED_WITH_REASON",
      reason: "not_present_in_cmr",
    });
  } else if (profile.nativeCanonicalImageHandoff) {
    // Identity/extracted text always via flatten; images via native handoff when deliverable.
    components.push({
      component: "multimodal_context",
      presentInCmr: true,
      status:
        handoff.mappedCount > 0
          ? "SUPPORTED"
          : handoff.omitted.length > 0
            ? "OMITTED_WITH_REASON"
            : "SUPPORTED_VIA_COMPATIBILITY",
      strategy:
        handoff.mappedCount > 0
          ? "native_image_parts"
          : "cmr_compatibility_flatten",
      reason:
        handoff.mappedCount > 0
          ? undefined
          : handoff.omitted[0]?.reason ?? "multimodal_identity_via_flatten",
      required: false,
    });
    capabilities.push({
      feature: "multimodal_context",
      state:
        handoff.mappedCount > 0
          ? "SUPPORTED"
          : handoff.omitted.length > 0
            ? "OMITTED_WITH_REASON"
            : "SUPPORTED_VIA_COMPATIBILITY",
      reason: handoff.omitted[0]?.reason,
    });
    for (const o of handoff.omitted) {
      capabilities.push({
        feature: `multimodal:${o.modality}`,
        state: "OMITTED_WITH_REASON",
        reason: o.reason,
      });
    }
    if (handoff.mappedCount > 0) {
      capabilities.push({
        feature: "multimodal:image",
        state: "SUPPORTED",
      });
    }
  } else {
    // Non–Phase-9A-native families: do not claim CMR image parts.
    // Reference-image-capable image providers (inventory) still deliver visuals
    // via adapter-mediated REFERENCE_IMAGE — that is compatibility, not a hard block.
    // Text Gemini/Cohere/etc. without that inventory claim remain unrepresentable
    // when authoritative image deliveries are present.
    const hasDeliverableImage = Boolean(
      input.modelRequest.multimodalProviderDeliveries?.some(
        (d) => Boolean(d.url || d.storageRef),
      ),
    );
    const adapterReference =
      providerSupportsAdapterMediatedReferenceImage(input.providerId);
    if (hasDeliverableImage && !adapterReference) {
      components.push({
        component: "multimodal_context",
        presentInCmr: true,
        status: "REQUIRED_BUT_UNREPRESENTABLE",
        reason: "provider_lacks_canonical_multimodal_handoff",
        required: true,
      });
      capabilities.push({
        feature: "multimodal_context",
        state: "REQUIRED_BUT_UNREPRESENTABLE",
        reason: "provider_lacks_canonical_multimodal_handoff",
      });
    } else {
      components.push({
        component: "multimodal_context",
        presentInCmr: true,
        status: "SUPPORTED_VIA_COMPATIBILITY",
        strategy: adapterReference
          ? "adapter_mediated_reference_image"
          : "cmr_compatibility_flatten",
        reason: adapterReference
          ? "inventory_reference_image_adapter"
          : "identity_or_extracted_text_via_flatten",
        required: false,
      });
      capabilities.push({
        feature: "multimodal_context",
        state: "SUPPORTED_VIA_COMPATIBILITY",
        reason: adapterReference
          ? "inventory_reference_image_adapter"
          : "identity_or_extracted_text_via_flatten",
      });
    }
  }

  const adapterReferenceDeliveries =
    providerSupportsAdapterMediatedReferenceImage(input.providerId);
  components.push({
    component: "multimodal_provider_deliveries",
    presentInCmr: present.multimodal_provider_deliveries,
    status: !present.multimodal_provider_deliveries
      ? "OMITTED_WITH_REASON"
      : profile.nativeCanonicalImageHandoff
        ? "SUPPORTED"
        : adapterReferenceDeliveries
          ? "SUPPORTED_VIA_COMPATIBILITY"
          : "REQUIRED_BUT_UNREPRESENTABLE",
    strategy: profile.nativeCanonicalImageHandoff
      ? "native_image_parts"
      : adapterReferenceDeliveries
        ? "adapter_mediated_reference_image"
        : undefined,
    reason: !present.multimodal_provider_deliveries
      ? "not_present_in_cmr"
      : profile.nativeCanonicalImageHandoff
        ? undefined
        : adapterReferenceDeliveries
          ? "inventory_reference_image_adapter"
          : "provider_lacks_canonical_multimodal_handoff",
    required: Boolean(
      present.multimodal_provider_deliveries &&
        !profile.nativeCanonicalImageHandoff &&
        !adapterReferenceDeliveries,
    ),
  });
  capabilities.push({
    feature: "multimodal_provider_deliveries",
    state: !present.multimodal_provider_deliveries
      ? "OMITTED_WITH_REASON"
      : profile.nativeCanonicalImageHandoff
        ? "SUPPORTED"
        : adapterReferenceDeliveries
          ? "SUPPORTED_VIA_COMPATIBILITY"
          : "REQUIRED_BUT_UNREPRESENTABLE",
    reason: !present.multimodal_provider_deliveries
      ? "not_present_in_cmr"
      : profile.nativeCanonicalImageHandoff
        ? undefined
        : adapterReferenceDeliveries
          ? "inventory_reference_image_adapter"
          : "provider_lacks_canonical_multimodal_handoff",
  });

  let supportedCount = 0;
  let compatibilityCount = 0;
  let omittedCount = 0;
  let requiredUnrepresentableCount = 0;
  for (const c of components) {
    if (c.status === "SUPPORTED") supportedCount += 1;
    else if (c.status === "SUPPORTED_VIA_COMPATIBILITY") compatibilityCount += 1;
    else if (c.status === "OMITTED_WITH_REASON") omittedCount += 1;
    else if (c.status === "REQUIRED_BUT_UNREPRESENTABLE") {
      requiredUnrepresentableCount += 1;
    }
  }

  // Extra capability notes for structured-output formatting (provider contract).
  if (present.output_contract || present.output_requirements) {
    capabilities.push({
      feature: "structured_output_formatting",
      state: profile.structuredOutputFormatting
        ? "SUPPORTED"
        : "SUPPORTED_VIA_COMPATIBILITY",
      reason: profile.structuredOutputFormatting
        ? "provider_response_format_or_tool_use"
        : "schema_text_via_flatten_only",
    });
  }

  return {
    applied: true,
    source: PROVIDER_REPRESENTATION_PLAN_SOURCE,
    providerId: input.providerId,
    modelId: input.modelId,
    providerFamily: profile.family,
    representationStrategy: "cmr_compatibility_flatten",
    components,
    capabilities,
    supportedCount,
    compatibilityCount,
    omittedCount,
    requiredUnrepresentableCount,
    componentNames: components
      .filter((c) => c.presentInCmr)
      .map((c) => c.component),
    capabilityStatuses: components.map(
      (c) => `${c.component}:${c.status}`,
    ),
    modelRequest: input.modelRequest,
  };
}

/**
 * Back-compat Phase 11 helper — now provider-aware when providerId supplied.
 */
export function assessCmrProviderRepresentation(
  modelRequest: CanonicalModelRequest,
  options?: { readonly providerId?: string; readonly modelId?: string },
): {
  readonly capabilities: readonly ModelRuntimeCapabilityNote[];
  readonly mappedCount: number;
  readonly omittedCount: number;
  readonly plan: ProviderRepresentationPlan;
} {
  const plan = buildProviderRepresentationPlan({
    modelRequest,
    providerId: options?.providerId,
    modelId: options?.modelId,
  });
  return {
    capabilities: plan.capabilities,
    mappedCount: plan.supportedCount + plan.compatibilityCount,
    omittedCount: plan.omittedCount,
    plan,
  };
}
