/**
 * Shared authoritative composition input for fanout leaves.
 * Only the VisualGenerationResult differs per leaf.
 */

import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  requiredDeterministicElements,
  resolveElementRealization,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type {
  CommunicationCompositionInput,
  CompositionBrandMarkInput,
  CompositionCanvasSpec,
  VisualGenerationResult,
} from "./types";

export type SharedCompositionAuthority = {
  readonly contract: DeliverableCompositionContract;
  readonly canvas: CompositionCanvasSpec;
  readonly primaryMessage: string;
  readonly supportingMessage?: string;
  readonly cta?: string;
  readonly brandMark: CompositionBrandMarkInput;
  readonly brandContext?: Readonly<Record<string, unknown>>;
  readonly provenance?: Readonly<Record<string, unknown>>;
  /** Exact selected route pin — shared across leaves. */
  readonly selectedRoute?: {
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly artifactKey: string;
  };
};

export function contractRequiresDeterministicComposition(
  contract: DeliverableCompositionContract | null | undefined,
): boolean {
  if (!contract) return false;
  return requiredDeterministicElements(contract).length > 0;
}

export function buildCommunicationCompositionInput(input: {
  readonly authority: SharedCompositionAuthority;
  readonly visual: VisualGenerationResult;
}): CommunicationCompositionInput {
  return {
    contract: input.authority.contract,
    visual: input.visual,
    canvas: input.authority.canvas,
    primaryMessage: input.authority.primaryMessage,
    supportingMessage: input.authority.supportingMessage,
    cta: input.authority.cta,
    brandMark: input.authority.brandMark,
    brandContext: input.authority.brandContext,
    provenance: {
      ...(input.authority.provenance ?? {}),
      ...(input.authority.selectedRoute
        ? {
            selectedRouteArtifactId: input.authority.selectedRoute.artifactId,
            selectedRouteArtifactVersion:
              input.authority.selectedRoute.artifactVersion,
            selectedRouteArtifactKey: input.authority.selectedRoute.artifactKey,
          }
        : {}),
    },
  };
}

/**
 * Resolve shared authority from execution metadata + explicit assets.
 * Fail closed when required deterministic values are absent.
 */
export function resolveSharedCompositionAuthority(input: {
  readonly contract: DeliverableCompositionContract;
  readonly canvas: CompositionCanvasSpec;
  readonly primaryMessage?: string | null;
  readonly supportingMessage?: string | null;
  readonly cta?: string | null;
  readonly brandMark?: CompositionBrandMarkInput | null;
  readonly brandContext?: Readonly<Record<string, unknown>>;
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly selectedRoute?: SharedCompositionAuthority["selectedRoute"];
}):
  | { ok: true; authority: SharedCompositionAuthority }
  | { ok: false; reason: string; element?: string } {
  const primary =
    typeof input.primaryMessage === "string"
      ? input.primaryMessage.trim()
      : "";
  if (
    resolveElementRealization(input.contract, "primary_message_surface") ===
      "deterministic" &&
    !primary
  ) {
    return {
      ok: false,
      reason: "missing_authoritative_primary_message",
      element: "primary_message_surface",
    };
  }
  if (
    resolveElementRealization(input.contract, "brand_signature") ===
      "deterministic" &&
    !input.brandMark?.bytes
  ) {
    return {
      ok: false,
      reason: "missing_authoritative_brand_mark_bytes",
      element: "brand_signature",
    };
  }
  return {
    ok: true,
    authority: {
      contract: input.contract,
      canvas: input.canvas,
      primaryMessage: primary,
      ...(input.supportingMessage
        ? { supportingMessage: input.supportingMessage.trim() }
        : {}),
      ...(input.cta ? { cta: input.cta.trim() } : {}),
      brandMark: input.brandMark!,
      brandContext: input.brandContext,
      provenance: input.provenance,
      selectedRoute: input.selectedRoute,
    },
  };
}
