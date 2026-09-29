/**
 * Provider-neutral reference → wire adaptation using the capability registry.
 */

import {
  planImageReferenceAdaptation,
  promptGuidanceForReferenceRole,
  type MultimodalReferenceRole,
} from "../../../ai/multimodal-context/reference-role";
import {
  resolveProviderReferenceRoleCapability,
  type ProviderReferenceWireAdaptation,
} from "../configs/provider-reference-capabilities";

export function adaptCanonicalReferenceForProvider(input: {
  readonly vendor: string;
  readonly role: MultimodalReferenceRole;
}): ProviderReferenceWireAdaptation {
  const basePlan = planImageReferenceAdaptation(input.role);
  const capability = resolveProviderReferenceRoleCapability({
    vendor: input.vendor,
    role: input.role,
  });

  if (!capability) {
    return Object.freeze({
      canonicalRole: input.role,
      capability: {
        wireSupported: false,
        providerSemanticMeaning: "prompt_only",
        referenceBehavior: "prompt_guidance_only",
        preservesIdentity: false,
        actsAsStyleTemplate: false,
        semanticPreservationOnWire: false,
        promptOnlyFallback: true,
      },
      deliverBytes: false,
      promptGuidance: basePlan.promptGuidance,
      providerSemanticMeaning: "prompt_only",
      referenceBehavior: "prompt_guidance_only",
      semanticPreservationOnWire: false,
      wireFieldIsTransportOnly: false,
      mappingExplicitlyUnsupported: true,
    });
  }

  const deliverBytes =
    capability.wireSupported && !capability.promptOnlyFallback;
  const mappingExplicitlyUnsupported =
    !capability.wireSupported && capability.promptOnlyFallback;

  let promptGuidance = promptGuidanceForReferenceRole(input.role);
  if (mappingExplicitlyUnsupported) {
    promptGuidance = [
      promptGuidance,
      `PROVIDER REFERENCE LIMITATION: ${input.vendor} has no semantically correct wire channel for canonical role ${input.role}. ` +
        "Follow prompt guidance only — do not infer style-transfer semantics from an unsupported attachment channel.",
    ].join(" ");
  }

  return Object.freeze({
    canonicalRole: input.role,
    capability,
    deliverBytes,
    promptGuidance,
    ...(capability.transport
      ? { providerTransport: capability.transport }
      : {}),
    providerSemanticMeaning: capability.providerSemanticMeaning,
    referenceBehavior: capability.referenceBehavior,
    semanticPreservationOnWire: capability.semanticPreservationOnWire,
    wireFieldIsTransportOnly:
      deliverBytes &&
      capability.providerSemanticMeaning !== "style_transfer" &&
      capability.transport?.fieldName.includes("style_reference") === true,
    mappingExplicitlyUnsupported,
  });
}

export function buildReferenceAdaptationPlansForProvider(input: {
  readonly vendor: string;
  readonly roles: readonly MultimodalReferenceRole[];
}): readonly ProviderReferenceWireAdaptation[] {
  return Object.freeze(
    input.roles.map((role) =>
      adaptCanonicalReferenceForProvider({ vendor: input.vendor, role }),
    ),
  );
}
