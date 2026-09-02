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
  const executionSpec = readExecutionSpecFromMetadata(meta);
  const userConstraintBlock =
    executionSpec?.creative.negativeConstraints?.length
      ? formatNegativeConstraintForProvider(
          executionSpec.creative.negativeConstraints.map((c) => c.value),
        )
      : "";

  if (isDirectImageOrVideoPassthrough(meta)) {
    const base = input.prompt.trim();
    const output = userConstraintBlock ? `${base}\n\n${userConstraintBlock}` : base;
    if (executionSpec?.creative.negativeConstraints?.length) {
      const transformation = auditPromptTransformation({
        stage: "append_output_requirements",
        inputPrompt: base,
        outputPrompt: output,
        spec: executionSpec,
      });
      logForensicImageConstraintAudit({
        executionId:
          typeof meta.executionId === "string"
            ? meta.executionId
            : typeof meta.apiExecutionId === "string"
              ? meta.apiExecutionId
              : undefined,
        productAction:
          typeof meta.productAction === "string" ? meta.productAction : undefined,
        stage: "append_output_requirements",
        metadata: meta,
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
    typeof meta.service === "string" ? meta.service.trim().toLowerCase() : "";
  const outputKind =
    typeof meta.outputKind === "string"
      ? meta.outputKind.trim().toLowerCase()
      : "";
  if (
    service === "website" ||
    outputKind === "deferred_website" ||
    outputKind === "website"
  ) {
    return input.prompt.trim();
  }

  const subtype =
    typeof meta.subtype === "string" ? meta.subtype : undefined;
  const category =
    typeof meta.category === "string" ? meta.category : undefined;
  const serviceRaw =
    typeof meta.service === "string" ? meta.service : undefined;

  if (!serviceRaw && !subtype) {
    return input.prompt.trim();
  }

  try {
    const spec = resolveServiceOutputSpec({
      service: serviceRaw,
      subtype,
      category,
      prompt: input.prompt,
    });
    const contractLines = buildContractDeliverablePromptLines(spec, {
      prompt: input.prompt,
    });
    const executionSpec = readExecutionSpecFromMetadata(meta);
    const userConstraintBlock =
      executionSpec?.creative.negativeConstraints?.length
        ? formatNegativeConstraintForProvider(
            executionSpec.creative.negativeConstraints.map((c) => c.value),
          )
        : "";
    const lines = [
      input.prompt.trim(),
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
    return input.prompt.trim();
  }
}
