/**
 * Priority 4.6 — Execution specification resolver with deterministic precedence.
 */

import { resolveServiceOutputSpec } from "../../config/service-output-map";
import {
  aspectRatioFromCanvas,
  resolveProductionInstructBundle,
  resolveProductionRule,
} from "../../config/format-production-spec";
import { appendProductionPromptBlockToText } from "../../config/format-production-spec/apply-production-spec-instruct";
import type { ConversationalAction } from "./conversational-task-contract";
import type { ConversationalRequirement } from "./conversational-task-contract";
import type { SemanticSignals } from "./semantic-signals";
import {
  defaultDeliverablesForService,
  deliverableFormatFromExportFormat,
  deliverableToOutputKindOverride,
  resolveDeliverables,
} from "./deliverable-resolver";
import type {
  AuthoritativeLogoCandidate,
  AuthoritativeLogoSpec,
  CanonicalExecutionSpecification,
  ContentItemSpec,
  DeliverableFormat,
  OutputIntentMode,
  ResolvedField,
} from "./execution-specification";
import {
  EXECUTION_RESOLUTION_PLANE_VERSION,
  defaultField,
  explicitField,
  field,
} from "./execution-specification";
import {
  interpretRequirementFields,
  type ExtractedRequirementFields,
} from "./requirement-field-interpreter";
import {
  detectReversedNegativeConcepts,
  mergeNegativeConstraints,
  negativeConstraintInstruction,
  resolvedNegativeConstraint,
} from "./requirement-enforcement";
import { buildVisualOperationSpec } from "./visual-modification-plan";
import type { VisualOperationSpec } from "./artifact-reference-input";
import {
  buildLogoClarificationQuestion,
  resolveAuthoritativeLogo,
  resolveLogoFollowUpFromMessage,
} from "./authoritative-logo-resolver";

export type ExecutionSpecResolverInput = {
  readonly message: string;
  readonly signals: SemanticSignals;
  readonly action: ConversationalAction;
  readonly requirements: readonly ConversationalRequirement[];
  readonly objective?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly brand?: string;
  readonly priorSpec?: CanonicalExecutionSpecification;
  readonly referencedArtifactId?: string;
  readonly referencedAssetId?: string;
  /** P4.9.7 — pre-discovered vault logo candidates (tests / client handoff). */
  readonly vaultLogoCandidates?: readonly AuthoritativeLogoCandidate[];
  readonly attachmentLogoAssetIds?: readonly string[];
  readonly vaultLogoChoice?: string;
  readonly brandName?: string;
  readonly generateNewLogoRequested?: boolean;
};

/** Service defaults for multi-direction services (e.g. branding generates 3 directions). */
const SERVICE_DEFAULT_QUANTITY: Readonly<Record<string, number>> = Object.freeze({
  "branding/brand-naming-taglines": 3,
  "branding/taglines": 3,
});

const SERVICE_DEFAULT_MODE: Readonly<Record<string, OutputIntentMode>> = Object.freeze({
  "branding/brand-naming-taglines": "ALTERNATIVES",
  "branding/taglines": "ALTERNATIVES",
});

function serviceKey(service?: string, subtype?: string): string {
  return `${(service ?? "").toLowerCase()}/${(subtype ?? "").toLowerCase()}`;
}

function pickField<T>(
  explicit: T | undefined,
  fromRequirements: T | undefined,
  serviceDefault: T | undefined,
  systemFallback: T | undefined,
  explicitFlag: boolean,
): ResolvedField<T> | undefined {
  if (explicit !== undefined && explicitFlag) {
    return explicitField(explicit, "EXPLICIT_USER");
  }
  if (fromRequirements !== undefined) {
    return field(fromRequirements, "EXPLICIT_USER", true);
  }
  if (serviceDefault !== undefined) {
    return defaultField(serviceDefault, "DEFAULT");
  }
  if (systemFallback !== undefined) {
    return defaultField(systemFallback, "SYSTEM");
  }
  return undefined;
}

function buildExecutionInstruction(spec: CanonicalExecutionSpecification): string {
  const parts: string[] = [];

  if (spec.task.objective?.value) {
    parts.push(spec.task.objective.value);
  }

  if (spec.content.contentItems?.length) {
    for (const item of spec.content.contentItems) {
      const { role, quantity, wordCount, sentenceCount } = item.value;
      let desc = `Exactly ${quantity} ${role}`;
      if (wordCount) desc += ` (${wordCount} words)`;
      if (sentenceCount) desc += ` (${sentenceCount} sentences)`;
      parts.push(desc);
    }
  } else if (spec.content.quantity?.value !== undefined) {
    const mode = spec.outputIntent.mode.value;
    if (mode === "FINAL" && spec.content.quantity.value === 1) {
      parts.push("Provide exactly one final result — no alternative directions.");
    } else if (mode === "ALTERNATIVES") {
      parts.push(`Provide exactly ${spec.content.quantity.value} alternatives/directions.`);
    }
  }

  if (spec.outputIntent.rationaleRequired?.value) {
    const count = spec.outputIntent.rationaleSentenceCount?.value;
    parts.push(
      count
        ? `Include rationale in exactly ${count} sentences.`
        : "Include rationale/explanation.",
    );
  }

  if (spec.content.ctaRequired?.value === false) {
    parts.push("Do not include a CTA.");
  }

  if (spec.technical.width?.value && spec.technical.height?.value) {
    parts.push(
      `Canvas size: ${spec.technical.width.value}×${spec.technical.height.value}px.`,
    );
  }

  if (spec.technical.aspectRatio?.value) {
    parts.push(`Aspect ratio: ${spec.technical.aspectRatio.value}.`);
  }

  if (spec.technical.pageCount?.value) {
    parts.push(`Page count: ${spec.technical.pageCount.value}.`);
  }

  if (spec.deliverables.length) {
    const formats = spec.deliverables.map((d) =>
      d.format === "EDITABLE_TEXT" ? "editable text" : d.format,
    );
    parts.push(`Required deliverables: ${formats.join(" + ")}.`);
  }

  for (const c of spec.creative.positiveConstraints ?? []) {
    if (c.provenance.enforcement === "SOFT_PREFERENCE") {
      parts.push(`Preference: ${c.value}.`);
    } else {
      parts.push(c.value);
    }
  }
  if (spec.creative.tone?.value) {
    parts.push(`Tone: ${spec.creative.tone.value}.`);
  }
  if (spec.creative.style?.value) {
    parts.push(`Style: ${spec.creative.style.value}.`);
  }
  for (const line of negativeConstraintInstruction(
    (spec.creative.negativeConstraints ?? []).map((c) => c.value),
  )) {
    parts.push(line);
  }

  for (const asset of spec.brandAssets?.requirements ?? []) {
    if (asset.value.required) {
      parts.push(
        asset.value.assetId
          ? `HARD CONSTRAINT — Use the brand ${asset.value.role} asset (${asset.value.assetId}) exactly as provided. Do not redraw, approximate, or replace it.`
          : `HARD CONSTRAINT — Use the brand ${asset.value.role} from the brand vault exactly as provided. Do not redraw, approximate, or replace it.`,
      );
    }
  }

  const logo = spec.referenceAssets?.logo?.value;
  if (logo?.mode === "USE_EXISTING" && logo.assetId) {
    parts.push(
      `HARD CONSTRAINT — Use authoritative logo asset ${logo.assetId} (${logo.source ?? "brand"}) exactly. Do not generate a replacement logo.`,
    );
  } else if (logo?.mode === "GENERATE_IF_ABSENT") {
    parts.push("No authoritative logo supplied — a new logo may be generated from the brief.");
  }

  return parts.join(" ");
}

function detectAmbiguity(
  extracted: ExtractedRequirementFields,
  message: string,
): string | undefined {
  const vagueSize = /\b(make it|make the)\s+bigger\b/i.test(message) &&
    extracted.width === undefined &&
    extracted.height === undefined;
  if (vagueSize) {
    return "What dimensions or size should I use? Please specify width×height or reference a prior artifact.";
  }
  return undefined;
}

export function resolveExecutionSpecification(
  input: ExecutionSpecResolverInput,
): CanonicalExecutionSpecification {
  const svcKey = serviceKey(input.service, input.subtype);
  // Capability checks use service map only — prompt refinement must not alter deliverable support.
  const serviceSpec = resolveServiceOutputSpec({
    service: input.service,
    subtype: input.subtype,
  });

  const extracted = interpretRequirementFields({
    message: input.message,
    signals: input.signals,
    requirements: input.requirements,
    objective: input.objective,
  });

  const prior = input.priorSpec;
  const formatFromState = input.format
    ? deliverableFormatFromExportFormat(input.format)
    : undefined;
  const formatFromSignal =
    input.signals.isExport && input.signals.exportFormat
      ? deliverableFormatFromExportFormat(input.signals.exportFormat)
      : undefined;
  const mergedDeliverables = [
    ...new Set([
      ...(prior?.deliverables.map((d) => d.format) ?? []),
      ...(extracted.deliverables ?? []),
      ...(formatFromState ? [formatFromState] : []),
      ...(formatFromSignal ? [formatFromSignal] : []),
    ]),
  ];
  const priorMode = prior?.outputIntent.mode;
  const preservePriorFinalMode =
    priorMode?.provenance.explicit &&
    priorMode.value === "FINAL" &&
    extracted.outputMode === "REFINEMENT";
  const reversedConcepts = detectReversedNegativeConcepts(input.message);
  const mergedNegativeSpecs = mergeNegativeConstraints({
    prior: prior?.creative.negativeConstraints,
    extracted: extracted.negativeConstraints,
    reversedConcepts,
  });

  const mergedExtracted = Object.freeze({
    ...extracted,
    deliverables: mergedDeliverables.length ? mergedDeliverables : extracted.deliverables,
    outputMode: preservePriorFinalMode
      ? "FINAL"
      : extracted.outputMode ??
        (priorMode?.provenance.explicit ? priorMode.value : undefined),
    quantity:
      extracted.quantity ??
      (prior?.content.quantity?.provenance.explicit
        ? prior.content.quantity.value
        : undefined),
    contentItems:
      extracted.contentItems?.length
        ? extracted.contentItems
        : prior?.content.contentItems?.map((i) => i.value),
    width: extracted.width ?? prior?.technical.width?.value,
    height: extracted.height ?? prior?.technical.height?.value,
    pageCount: extracted.pageCount ?? prior?.technical.pageCount?.value,
    rationaleRequired:
      extracted.rationaleRequired ?? prior?.outputIntent.rationaleRequired?.value,
    rationaleSentenceCount:
      extracted.rationaleSentenceCount ??
      prior?.outputIntent.rationaleSentenceCount?.value,
    ctaRequired:
      extracted.ctaRequired ?? prior?.content.ctaRequired?.value,
    tone: extracted.tone ?? prior?.creative.tone?.value,
    style: extracted.style ?? prior?.creative.style?.value,
    visualDirection:
      extracted.visualDirection ?? prior?.creative.visualDirection?.value,
    positiveConstraints: [
      ...new Set([
        ...(prior?.creative.positiveConstraints?.map((c) => c.value) ?? []),
        ...(extracted.positiveConstraints ?? []),
      ]),
    ],
    negativeConstraints: mergedNegativeSpecs,
    brandAssetRequired:
      extracted.brandAssetRequired ?? prior?.brandAssets?.requirements?.some((a) => a.value.required),
    explicit:
      extracted.explicit ||
      Boolean(prior && (extracted.deliverables?.length || extracted.outputMode)),
  });

  const svcDefaultQty = SERVICE_DEFAULT_QUANTITY[svcKey];
  const svcDefaultMode = SERVICE_DEFAULT_MODE[svcKey] ?? "EXPLORATORY";

  const explicitQty = mergedExtracted.explicit ? mergedExtracted.quantity : undefined;
  const contentItemQty = (() => {
    const items = mergedExtracted.contentItems;
    if (!items?.length) return undefined;
    if (items.length > 1 && items.every((i) => i.quantity === 1)) return 1;
    return items.reduce((sum, i) => sum + i.quantity, 0);
  })();
  const resolvedQuantity = pickField(
    explicitQty ?? (contentItemQty === 1 ? 1 : contentItemQty),
    undefined,
    svcDefaultQty,
    1,
    extracted.explicit && (explicitQty !== undefined || contentItemQty !== undefined),
  );

  const explicitMode = mergedExtracted.outputMode;
  const resolvedMode = pickField<OutputIntentMode>(
    explicitMode,
    undefined,
    svcDefaultMode,
    "EXPLORATORY",
    extracted.explicit && explicitMode !== undefined,
  ) ?? defaultField("EXPLORATORY", "SYSTEM");

  // When user says "one final", force mode FINAL and quantity 1
  if (resolvedMode.value === "FINAL" && !resolvedQuantity) {
    // quantity defaults to 1 for FINAL
  }

  const finalQuantity =
    resolvedMode.value === "FINAL" && !resolvedQuantity
      ? explicitField(1, "EXPLICIT_USER")
      : resolvedMode.value === "FINAL" && resolvedQuantity && resolvedQuantity.value > 1
        ? explicitField(1, "EXPLICIT_USER")
        : resolvedQuantity;

  const requestedDeliverables = mergedExtracted.deliverables ?? [];
  const serviceDefaults = defaultDeliverablesForService(serviceSpec);
  const deliverableResult = resolveDeliverables({
    requested: requestedDeliverables,
    serviceDefaultFormats: serviceDefaults,
    serviceSpec,
    explicitOnly: requestedDeliverables.length > 0,
    mergeServiceDefaults: true,
  });

  const contentItems: readonly ResolvedField<ContentItemSpec>[] | undefined =
    mergedExtracted.contentItems?.map((item) =>
      explicitField(item, item.quantity === 1 && resolvedMode.value === "FINAL" ? "EXPLICIT_USER" : "INFERRED"),
    );

  const ambiguity = detectAmbiguity(mergedExtracted, input.message);

  const priorLogo = prior?.referenceAssets?.logo?.value;
  const logoFollowUp = resolveLogoFollowUpFromMessage({
    message: input.message,
    prior: priorLogo?.mode === "NEEDS_SELECTION" ? priorLogo : undefined,
  });
  const generateNewLogoRequested =
    input.generateNewLogoRequested === true ||
    logoFollowUp?.mode === "GENERATE_IF_ABSENT" ||
    /\b(generate|create|make)\s+(?:a\s+)?new\s+logo\b/i.test(input.message);

  const authoritativeLogo: AuthoritativeLogoSpec = logoFollowUp ??
    resolveAuthoritativeLogo({
      vaultCandidates: input.vaultLogoCandidates,
      attachmentLogoAssetIds: [
        ...(input.attachmentLogoAssetIds ?? []),
        ...(input.referencedAssetId ? [input.referencedAssetId] : []),
      ],
      vaultLogoChoice: input.vaultLogoChoice,
      generateNewRequested: generateNewLogoRequested,
      prior: priorLogo,
    });

  const logoClarification =
    authoritativeLogo.mode === "NEEDS_SELECTION" && authoritativeLogo.candidates?.length
      ? buildLogoClarificationQuestion(
          authoritativeLogo.candidates,
          input.brandName ?? input.brand,
        )
      : undefined;

  const operationSpec: VisualOperationSpec | undefined =
    buildVisualOperationSpec({
      action: input.action,
      message: input.message,
      referencedArtifactId: input.referencedArtifactId,
      referencedAssetId: input.referencedAssetId,
      preserveExisting: true,
    }) ?? prior?.operation;

  let resolutionState: CanonicalExecutionSpecification["resolutionState"] =
    deliverableResult.resolutionState === "UNSUPPORTED_DELIVERABLE" &&
    requestedDeliverables.length > 0
      ? "UNSUPPORTED_DELIVERABLE"
      : logoClarification || ambiguity
        ? "CLARIFICATION_REQUIRED"
        : authoritativeLogo.mode === "NEEDS_SELECTION"
          ? "CLARIFICATION_REQUIRED"
          : "RESOLVED";

  const brandAssetRequirements = [
    ...(prior?.brandAssets?.requirements ?? []),
    ...(mergedExtracted.brandAssetRequired
      ? [
          explicitField(
            Object.freeze({
              role: "logo" as const,
              required: true,
              ...(authoritativeLogo.mode === "USE_EXISTING" && authoritativeLogo.assetId
                ? {
                    assetId: authoritativeLogo.assetId,
                    source: "EXPLICIT_USER" as const,
                  }
                : {}),
            }),
            "EXPLICIT_USER",
          ),
        ]
      : []),
  ];

  // Format & Production Spec — seed canvas when user/prior did not specify dimensions.
  const productionResolved = resolveProductionRule({
    service: input.service,
    subtype: input.subtype,
    platform: input.platform,
    formatId: input.format,
  });
  const productionCanvas =
    productionResolved?.rule.canvas?.unit === "px"
      ? productionResolved.rule.canvas
      : undefined;
  const productionAspect =
    productionCanvas != null
      ? aspectRatioFromCanvas(productionCanvas.width, productionCanvas.height)
      : undefined;

  const spec: CanonicalExecutionSpecification = Object.freeze({
    planeVersion: EXECUTION_RESOLUTION_PLANE_VERSION,
    task: Object.freeze({
      action: explicitField(input.action, "EXPLICIT_USER"),
      objective: input.objective
        ? explicitField(input.objective, "EXPLICIT_USER")
        : extracted.objective
          ? explicitField(extracted.objective, "INFERRED")
          : undefined,
      service: input.service ? explicitField(input.service, "SYSTEM") : undefined,
      subtype: input.subtype ? explicitField(input.subtype, "SYSTEM") : undefined,
      industry: input.industry ? explicitField(input.industry, "SYSTEM") : undefined,
      brand: input.brand ? explicitField(input.brand, "SYSTEM") : undefined,
    }),
    content: Object.freeze({
      quantity: finalQuantity,
      exactness: mergedExtracted.exactness
        ? explicitField(mergedExtracted.exactness, "EXPLICIT_USER")
        : resolvedMode.value === "FINAL"
          ? explicitField("exact" as const, "INFERRED")
          : undefined,
      wordCount: mergedExtracted.wordCount
        ? explicitField(mergedExtracted.wordCount, "EXPLICIT_USER")
        : undefined,
      sentenceCount: mergedExtracted.sentenceCount
        ? explicitField(mergedExtracted.sentenceCount, "EXPLICIT_USER")
        : undefined,
      ctaRequired:
        mergedExtracted.ctaRequired === false
          ? explicitField(false, "EXPLICIT_USER")
          : undefined,
      contentItems,
    }),
    creative: Object.freeze({
      tone: mergedExtracted.tone ? explicitField(mergedExtracted.tone, "EXPLICIT_USER") : prior?.creative.tone,
      style: mergedExtracted.style ? explicitField(mergedExtracted.style, "EXPLICIT_USER") : prior?.creative.style,
      visualDirection: mergedExtracted.visualDirection
        ? explicitField(mergedExtracted.visualDirection, "EXPLICIT_USER")
        : prior?.creative.visualDirection,
      positiveConstraints: mergedExtracted.positiveConstraints?.map((c) =>
        explicitField(c, "EXPLICIT_USER"),
      ),
      negativeConstraints: mergedNegativeSpecs.map((c) =>
        resolvedNegativeConstraint(c, "EXPLICIT_USER", true),
      ),
    }),
    brandAssets:
      brandAssetRequirements.length
        ? Object.freeze({
            requirements: Object.freeze(brandAssetRequirements),
          })
        : undefined,
    referenceAssets: Object.freeze({
      logo: explicitField(authoritativeLogo, "EXPLICIT_USER"),
    }),
    technical: Object.freeze({
      width: mergedExtracted.width
        ? explicitField(mergedExtracted.width, "EXPLICIT_USER")
        : productionCanvas
          ? defaultField(productionCanvas.width, "DEFAULT")
          : undefined,
      height: mergedExtracted.height
        ? explicitField(mergedExtracted.height, "EXPLICIT_USER")
        : productionCanvas
          ? defaultField(productionCanvas.height, "DEFAULT")
          : undefined,
      aspectRatio: productionAspect
        ? mergedExtracted.width && mergedExtracted.height
          ? explicitField(
              aspectRatioFromCanvas(mergedExtracted.width, mergedExtracted.height),
              "EXPLICIT_USER",
            )
          : defaultField(productionAspect, "DEFAULT")
        : prior?.technical.aspectRatio,
      pageCount: mergedExtracted.pageCount
        ? explicitField(mergedExtracted.pageCount, "EXPLICIT_USER")
        : undefined,
      platform: input.platform ? explicitField(input.platform, "SYSTEM") : undefined,
      resolution: productionResolved?.rule.colour
        ? defaultField(productionResolved.rule.colour, "DEFAULT")
        : prior?.technical.resolution,
    }),
    deliverables: deliverableResult.deliverables,
    outputIntent: Object.freeze({
      mode: resolvedMode,
      alternativesRequested:
        mergedExtracted.alternativesRequested !== undefined
          ? explicitField(mergedExtracted.alternativesRequested, "EXPLICIT_USER")
          : resolvedMode.value === "ALTERNATIVES"
            ? defaultField(true, "DEFAULT")
            : resolvedMode.value === "FINAL"
              ? explicitField(false, "EXPLICIT_USER")
              : undefined,
      rationaleRequired: mergedExtracted.rationaleRequired
        ? explicitField(true, "EXPLICIT_USER")
        : undefined,
      rationaleSentenceCount: mergedExtracted.rationaleSentenceCount
        ? explicitField(mergedExtracted.rationaleSentenceCount, "EXPLICIT_USER")
        : undefined,
    }),
    resolutionState,
    clarificationQuestion: logoClarification ?? ambiguity,
    unsupportedDeliverables:
      deliverableResult.unsupported.length > 0
        ? deliverableResult.unsupported
        : undefined,
    operation: operationSpec,
    executionInstruction: "",
  });

  const withInstruction = Object.freeze({
    ...spec,
    executionInstruction: (() => {
      const base = buildExecutionInstruction(spec);
      const instruct = resolveProductionInstructBundle({
        service: input.service,
        subtype: input.subtype,
        platform: input.platform,
        formatId: input.format,
      });
      if (!instruct) return base;
      return appendProductionPromptBlockToText(base, instruct.promptBlock.text);
    })(),
  });

  return withInstruction;
}

export function executionSpecOutputKindOverride(
  spec: CanonicalExecutionSpecification,
  options?: { readonly service?: string },
): string | undefined {
  return deliverableToOutputKindOverride(spec.deliverables, {
    service: spec.task.service?.value ?? options?.service,
  });
}

export function executionSpecRequiresPresentationExpand(
  spec: CanonicalExecutionSpecification,
): boolean {
  return spec.deliverables.some(
    (d) => d.format === "PDF" || d.format === "PPTX",
  );
}

export { buildExecutionInstruction };
