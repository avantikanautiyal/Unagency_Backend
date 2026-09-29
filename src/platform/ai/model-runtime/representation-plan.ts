/**
 * Phase 12 — ProviderRepresentationPlan (provider-neutral).
 * Describes how CMR components will be represented — not provider-native bodies.
 */

import type { CanonicalModelRequest } from "../canonical-model-request";
import type {
  ModelRuntimeCapabilityNote,
  ModelRuntimeCapabilityState,
  ModelRuntimeRepresentationStrategy,
} from "./types";
import type { CmrProviderFamily } from "./provider-profile";

export const PROVIDER_REPRESENTATION_PLAN_SOURCE =
  "provider_representation_plan" as const;

export type CmrComponentName =
  | "current_user_instruction"
  | "current_task"
  | "requirements"
  | "constraints"
  | "exclusions"
  | "selections"
  | "approved_decisions"
  | "resolved_references"
  | "working_memory"
  | "multimodal_context"
  | "multimodal_provider_deliveries"
  | "active_brief"
  | "cdf_context"
  | "upstream_artifact"
  | "production_spec"
  | "output_contract"
  | "output_requirements"
  | "authority";

export type ProviderRepresentationComponent = {
  readonly component: CmrComponentName;
  readonly presentInCmr: boolean;
  readonly status: ModelRuntimeCapabilityState;
  readonly strategy?: ModelRuntimeRepresentationStrategy | "native_image_parts";
  readonly reason?: string;
  readonly required: boolean;
};

export type ProviderRepresentationPlan = {
  readonly applied: true;
  readonly source: typeof PROVIDER_REPRESENTATION_PLAN_SOURCE;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly providerFamily: CmrProviderFamily;
  readonly representationStrategy: ModelRuntimeRepresentationStrategy;
  readonly components: readonly ProviderRepresentationComponent[];
  readonly capabilities: readonly ModelRuntimeCapabilityNote[];
  readonly supportedCount: number;
  readonly compatibilityCount: number;
  readonly omittedCount: number;
  readonly requiredUnrepresentableCount: number;
  readonly componentNames: readonly string[];
  readonly capabilityStatuses: readonly string[];
  /** Semantic CMR reference — never mutated. */
  readonly modelRequest: CanonicalModelRequest;
};

export function summarizeRepresentationPlan(
  plan: ProviderRepresentationPlan,
): Record<string, unknown> {
  return {
    capabilityAssessmentApplied: true,
    provider: plan.providerId,
    model: plan.modelId,
    providerFamily: plan.providerFamily,
    representationStrategy: plan.representationStrategy,
    representationSource: plan.source,
    supportedCount: plan.supportedCount,
    compatibilityCount: plan.compatibilityCount,
    omittedCount: plan.omittedCount,
    requiredUnrepresentableCount: plan.requiredUnrepresentableCount,
    componentNames: plan.componentNames,
    capabilityStatuses: plan.capabilityStatuses,
  };
}
