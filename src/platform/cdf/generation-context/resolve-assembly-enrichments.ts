/**
 * Phase 5 — Resolve Production Spec + output requirements for CMR assembly.
 * Uses existing Production Spec / service-output helpers. No DB/artifact loads.
 */

import {
  applyProductionSpecInstructToMetadata,
  type ProductionInstructBundle,
} from "../../config/format-production-spec";
import {
  buildContractDeliverablePromptLines,
  resolveServiceOutputSpec,
} from "../../config/service-output-map";
import {
  cdfContractIsNonVisual,
  resolveCdfContractFromMetadata,
} from "../execution-authority";
import { composeDeliverableSemantics } from "./compose-deliverable-semantics";
import type { CompiledCreativeComposition } from "./compile-deliverable-composition";

export type CanonicalProductionSpecEnrichment = {
  productionRuleId: string;
  contentHash: string;
  text: string;
  authorityStatus: string;
  edition: string;
  provenance: string;
  version: string;
  sections: Array<{ id: string; title: string; lines: readonly string[] }>;
};

export type CanonicalOutputRequirementsEnrichment = {
  deliverable: string;
  kind: string;
  modalities: string[];
  mockupRole: string;
  lines: string[];
  promptBlock: string;
};

export type CanonicalAssemblyEnrichments = {
  productionSpec?: CanonicalProductionSpecEnrichment;
  outputRequirements?: CanonicalOutputRequirementsEnrichment;
  deliverableComposition?: CompiledCreativeComposition;
  /** Metadata stamped with productionSpecBinding (no prompt append). */
  metadata: Record<string, unknown>;
};

function readString(
  meta: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function enrichmentFromBundle(
  bundle: ProductionInstructBundle,
): CanonicalProductionSpecEnrichment {
  return {
    productionRuleId: bundle.binding.productionRuleId,
    contentHash: bundle.promptBlock.contentHash,
    text: bundle.promptBlock.text,
    authorityStatus: String(bundle.binding.authorityStatus),
    edition: String(bundle.promptBlock.edition),
    provenance: String(bundle.promptBlock.provenance),
    version: String(bundle.promptBlock.version),
    sections: bundle.promptBlock.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lines: s.lines,
    })),
  };
}

/**
 * Resolve enrichments from already-authorized execution metadata.
 * Stamps Spec binding onto metadata; does not append Spec to any prompt string.
 *
 * Non-visual CDF contracts (text / structured docs) must NOT receive
 * social/content-design PNG/JPG production Spec or image deliverable lines.
 */
export function resolveCanonicalAssemblyEnrichments(
  metadata: Readonly<Record<string, unknown>>,
): CanonicalAssemblyEnrichments {
  const cdfContract = resolveCdfContractFromMetadata(metadata);
  const skipImageSpec =
    metadata.cdfSkipImageProductionSpec === true ||
    metadata.skipProductionSpecInstruct === true ||
    (cdfContract != null && cdfContractIsNonVisual(cdfContract));

  if (skipImageSpec) {
    // Still allow CDF-native output_contract in CMR; omit product-map PNG Spec.
    return {
      metadata: {
        ...metadata,
        cdfSkipImageProductionSpec: true,
        skipProductionSpecInstruct: true,
        skipOutputRequirements: true,
      },
    };
  }

  // force: true — canonical path must assemble Spec into CMR when a rule exists,
  // independent of prompt-inject rollout (binding still uses existing resolver).
  const applied = applyProductionSpecInstructToMetadata(
    { ...metadata },
    { force: true, projection: "provider_technical" },
  );

  const productionSpec = applied.bundle
    ? enrichmentFromBundle(applied.bundle)
    : undefined;

  let outputRequirements: CanonicalOutputRequirementsEnrichment | undefined;
  const serviceRaw = readString(applied.metadata, "service");
  const subtype = readString(applied.metadata, "subtype");
  const category = readString(applied.metadata, "category");
  const outputKind = readString(applied.metadata, "outputKind");
  const cdfService = readString(applied.metadata, "cdfServiceId");
  const platform = readString(applied.metadata, "platform");
  const format = readString(applied.metadata, "format");

  const serviceForMap =
    serviceRaw ??
    (outputKind === "presentation" || cdfService === "presentation"
      ? "Presentations"
      : undefined);

  if (serviceForMap || subtype) {
    try {
      const spec = resolveServiceOutputSpec({
        service: serviceForMap,
        subtype,
        category,
        prompt: "",
      });
      const deliverableSemantics = composeDeliverableSemantics({
        deliverableLabel:
          readString(applied.metadata, "cdfDeliverableLabel") ??
          readString(applied.metadata, "cdfGenerationLabel") ??
          readString(applied.metadata, "cdfProgressLabel"),
        phaseName: readString(applied.metadata, "cdfPhaseName"),
        artifactKey: readString(applied.metadata, "cdfArtifactKey"),
        generationModality:
          readString(applied.metadata, "cdfGenerationModality") ?? outputKind,
        productGrounding: {
          platform,
          format,
          category,
          subtype,
          service: serviceForMap,
        },
        // Only used when no platform/format/phase label — never prefer OR-list catch-alls.
        fallbackExampleDeliverable:
          platform || format
            ? undefined
            : spec.exampleDeliverable,
      });
      const contractLines = buildContractDeliverablePromptLines(spec, {
        prompt: "",
      }).filter((line) => {
        // Drop catch-all service-map primary lines when concrete semantics exist.
        if (deliverableSemantics.source !== "service_map_fallback") {
          if (/^Primary deliverable:/i.test(line)) return false;
          if (line.includes(spec.exampleDeliverable)) return false;
        }
        return true;
      });
      const lines = [
        `Deliverable: ${deliverableSemantics.concreteLabel}`,
        `Deliverable semantics: ${deliverableSemantics.statement}`,
        `Format: ${spec.kind}`,
        `Modalities: ${spec.modalities.join(", ")}`,
        `Mockup role: ${spec.mockupRole}`,
        ...contractLines,
      ];
      outputRequirements = {
        deliverable: deliverableSemantics.concreteLabel,
        kind: String(spec.kind),
        modalities: [...spec.modalities],
        mockupRole: String(spec.mockupRole),
        lines,
        promptBlock: `[Output requirements]\n${lines.join("\n")}`,
      };
      applied.metadata.providerDeliverableSemantics =
        deliverableSemantics.statement;
      applied.metadata.providerSemanticTask = deliverableSemantics.statement;
    } catch {
      // Service map miss — leave unset.
    }
  }

  return {
    productionSpec,
    outputRequirements,
    metadata: applied.metadata,
  };
}
