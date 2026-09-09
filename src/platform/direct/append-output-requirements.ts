/**
 * Append spreadsheet output requirements to the user prompt before provider call.
 */

import {
  buildContractDeliverablePromptLines,
  resolveServiceOutputSpec,
} from "../config/service-output-map";
import { readExecutionSpecFromMetadata } from "../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import { formatNegativeConstraintForProvider } from "../collaboration/conversational-task-intelligence/requirement-enforcement";
import {
  auditPromptTransformation,
  logForensicImageConstraintAudit,
} from "../collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import { ensureProviderPromptHasProductionSpec } from "../config/format-production-spec";

function isDirectImageOrVideoPassthrough(
  metadata: Readonly<Record<string, unknown>>
): boolean {
  if (metadata.skipOutputRequirements === true) return true;
  if (metadata.routeVisualSlot !== undefined) return true;
  if (
    typeof metadata.productAction === "string" &&
    (metadata.productAction.trim().toLowerCase() === "visual_direction" ||
      metadata.productAction.trim().toLowerCase() === "route_visual_refine")
  ) {
    return true;
  }
  const capability =
    typeof metadata.capabilityId === "string"
      ? metadata.capabilityId.trim().toLowerCase()
      : typeof metadata.capabilityHint === "string"
        ? metadata.capabilityHint.trim().toLowerCase()
        : "";
  if (capability === "image.generate" || capability === "video.generate") {
    return true;
  }
  // image.edit still needs output-contract requirements from the map when present;
  // do not treat it as a raw visual passthrough.
  if (capability === "image.edit") {
    return false;
  }
  const action =
    typeof metadata.productAction === "string"
      ? metadata.productAction.trim().toLowerCase()
      : "";
  return action === "route_visual";
}

export function appendOutputRequirementsToPrompt(input: {
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string {
  const meta = input.metadata ?? {};
  const withProduction = ensureProviderPromptHasProductionSpec({
    prompt: input.prompt,
    metadata: meta,
  });
  const promptWithSpec = withProduction.prompt;
  const metaWithSpec = withProduction.metadata;
  const executionSpec = readExecutionSpecFromMetadata(metaWithSpec);
  const userConstraintBlock =
    executionSpec?.creative.negativeConstraints?.length
      ? formatNegativeConstraintForProvider(
          executionSpec.creative.negativeConstraints.map((c) => c.value),
        )
      : "";

  if (isDirectImageOrVideoPassthrough(metaWithSpec)) {
    const base = promptWithSpec.trim();
    const logoAssetId =
      typeof metaWithSpec.brandLogoAssetId === "string"
        ? metaWithSpec.brandLogoAssetId.trim()
        : typeof metaWithSpec.logoAssetId === "string"
          ? metaWithSpec.logoAssetId.trim()
          : "";
    const hasLogoRef =
      Boolean(logoAssetId) ||
      (Array.isArray(metaWithSpec.assetIds) && metaWithSpec.assetIds.length > 0);
    const logoBlock = hasLogoRef
      ? "[HARD CONSTRAINT] Use the attached reference logo/brand mark exactly — do not invent, retype, or substitute the brand name as plain typography."
      : "";
    const logoSpecBlock =
      executionSpec?.referenceAssets?.logo?.value?.mode === "USE_EXISTING" &&
      executionSpec.referenceAssets.logo.value.assetId
        ? "[HARD CONSTRAINT] Bind the authoritative brand logo from the execution specification — use the attached reference mark exactly."
        : "";
    const constraintParts = [userConstraintBlock, logoBlock || logoSpecBlock]
      .map((s) => s.trim())
      .filter(Boolean);
    const output =
      constraintParts.length > 0
        ? `${base}\n\n${constraintParts.join("\n\n")}`
        : base;
    if (
      executionSpec?.creative.negativeConstraints?.length ||
      hasLogoRef ||
      logoSpecBlock ||
      withProduction.injected
    ) {
      const transformation = auditPromptTransformation({
        stage: "append_output_requirements",
        inputPrompt: input.prompt.trim(),
        outputPrompt: output,
        spec: executionSpec,
      });
      logForensicImageConstraintAudit({
        executionId:
          typeof metaWithSpec.executionId === "string"
            ? metaWithSpec.executionId
            : typeof metaWithSpec.apiExecutionId === "string"
              ? metaWithSpec.apiExecutionId
              : undefined,
        productAction:
          typeof metaWithSpec.productAction === "string"
            ? metaWithSpec.productAction
            : undefined,
        stage: "append_output_requirements",
        metadata: metaWithSpec,
        spec: executionSpec,
        prompt: output,
        transformation,
      });
    }
    return output;
  }
  // Web Tech already uses WebsitePage structured instructions — don't append
  // another deliverable block (extra tokens slow the coding model).
  const service =
    typeof metaWithSpec.service === "string"
      ? metaWithSpec.service.trim().toLowerCase()
      : "";
  const outputKind =
    typeof metaWithSpec.outputKind === "string"
      ? metaWithSpec.outputKind.trim().toLowerCase()
      : "";
  if (
    service === "website" ||
    outputKind === "deferred_website" ||
    outputKind === "website"
  ) {
    return promptWithSpec.trim();
  }

  const subtype =
    typeof metaWithSpec.subtype === "string" ? metaWithSpec.subtype : undefined;
  const category =
    typeof metaWithSpec.category === "string" ? metaWithSpec.category : undefined;
  const serviceRaw =
    typeof metaWithSpec.service === "string" ? metaWithSpec.service : undefined;

  if (!serviceRaw && !subtype) {
    return promptWithSpec.trim();
  }

  try {
    const spec = resolveServiceOutputSpec({
      service: serviceRaw,
      subtype,
      category,
      prompt: promptWithSpec,
    });
    const contractLines = buildContractDeliverablePromptLines(spec, {
      prompt: promptWithSpec,
    });
    const lines = [
      promptWithSpec.trim(),
      ...(userConstraintBlock ? ["", userConstraintBlock] : []),
      "",
      "[Output requirements]",
      `Deliverable: ${spec.exampleDeliverable}`,
      `Format: ${spec.kind}`,
      `Modalities: ${spec.modalities.join(", ")}`,
      `Mockup role: ${spec.mockupRole}`,
      ...contractLines,
    ];
    return lines.join("\n");
  } catch {
    return promptWithSpec.trim();
  }
}
