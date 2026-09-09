/**
 * P4.9.2 — Canonical execution-input requirement classification.
 * Provider-independent, service-agnostic boundary for optional vs required context.
 */

import { logoRoleFromMetadata } from "../os/creative/creative-intent-classifier";
import type { BrandMemorySlotKey } from "../os/creative/brand-memory-slots";
import type { CanonicalExecutionSpecification } from "../collaboration/conversational-task-intelligence/execution-specification";

export type ExecutionInputRequirement =
  | "REQUIRED"
  | "OPTIONAL"
  | "CONDITIONALLY_REQUIRED";

export type ExecutionInputKind =
  | "brand_logo"
  | "brand_colors"
  | "vault_asset"
  | "reference_image"
  | "html_output"
  | "requested_cta"
  | "required_section";

export type ExecutionInputClassificationContext = {
  readonly kind: ExecutionInputKind;
  readonly service?: string;
  readonly brief?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly executionSpec?: CanonicalExecutionSpecification;
};

const EXPLICIT_LOGO_BRIEF =
  /\b(use|with|include|featuring|show(?:ing)?)\s+(?:our|the|my|their|brand)\s+(?:approved\s+)?logo\b/i;

function metadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string {
  const raw = metadata?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function deliverableRequiresHtml(
  executionSpec?: CanonicalExecutionSpecification,
): boolean {
  if (!executionSpec?.deliverables?.length) return false;
  return executionSpec.deliverables.some(
    (d) => d.format === "HTML" || d.format === "ZIP",
  );
}

export function classifyExecutionInputRequirement(
  ctx: ExecutionInputClassificationContext,
): ExecutionInputRequirement {
  switch (ctx.kind) {
    case "brand_logo": {
      const logoRole = logoRoleFromMetadata(ctx.metadata);
      if (logoRole === "reuse_canonical" || logoRole === "reuse_attached") {
        return "REQUIRED";
      }
      if (logoRole === "create_new") return "OPTIONAL";
      const brief = ctx.brief?.trim() ?? "";
      if (brief && EXPLICIT_LOGO_BRIEF.test(brief)) {
        return "CONDITIONALLY_REQUIRED";
      }
      return "OPTIONAL";
    }
    case "brand_colors":
      return "OPTIONAL";
    case "vault_asset":
      return "OPTIONAL";
    case "reference_image": {
      if (
        ctx.executionSpec?.brandAssets?.requirements?.some(
          (r) => r.value.required && r.value.role === "reference",
        )
      ) {
        return "CONDITIONALLY_REQUIRED";
      }
      const cap = metadataString(ctx.metadata, "capabilityId").toLowerCase();
      if (cap === "image.edit") return "CONDITIONALLY_REQUIRED";
      return "OPTIONAL";
    }
    case "html_output": {
      const brief = ctx.brief?.trim() ?? "";
      if (
        deliverableRequiresHtml(ctx.executionSpec) ||
        /\boutput:\s*html\b/i.test(brief) ||
        /\b(html|static html|html page|html deliverable)\b/i.test(brief)
      ) {
        return "REQUIRED";
      }
      const service = (ctx.service ?? metadataString(ctx.metadata, "service")).toLowerCase();
      if (service === "website") return "REQUIRED";
      return "CONDITIONALLY_REQUIRED";
    }
    case "requested_cta":
    case "required_section":
      return "CONDITIONALLY_REQUIRED";
    default:
      return "OPTIONAL";
  }
}

export function shouldBlockExecutionOnMissingInput(input: {
  readonly kind: ExecutionInputKind;
  readonly service?: string;
  readonly brief?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly executionSpec?: CanonicalExecutionSpecification;
}): boolean {
  const requirement = classifyExecutionInputRequirement(input);
  return requirement === "REQUIRED" || requirement === "CONDITIONALLY_REQUIRED";
}

export function filterBlockingMissingBrandSlots(input: {
  readonly missingSlots: readonly BrandMemorySlotKey[];
  readonly service?: string;
  readonly brief?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly executionSpec?: CanonicalExecutionSpecification;
}): BrandMemorySlotKey[] {
  const slotToKind: Partial<Record<BrandMemorySlotKey, ExecutionInputKind>> = {
    logo: "brand_logo",
    voice: "brand_colors",
    colors: "brand_colors",
    productHero: "vault_asset",
    campaignLook: "vault_asset",
    wordmark: "brand_logo",
    icon: "vault_asset",
  };

  return input.missingSlots.filter((slot) => {
    const kind = slotToKind[slot];
    if (!kind) return true;
    return shouldBlockExecutionOnMissingInput({
      kind,
      service: input.service,
      brief: input.brief,
      metadata: input.metadata,
      executionSpec: input.executionSpec,
    });
  });
}

export function optionalBrandContextObservability(input: {
  readonly logoAvailable: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    logoAvailable: input.logoAvailable,
    optionalContextAvailable: input.logoAvailable,
  };
}
