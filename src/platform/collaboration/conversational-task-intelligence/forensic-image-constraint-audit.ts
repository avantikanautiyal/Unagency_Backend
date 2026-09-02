/**
 * P4.8.2 — Forensic image-generation constraint audit.
 * Safe structured traces only — no raw conversation or API keys.
 */

import { createHash } from "crypto";
import type { CanonicalExecutionSpecification } from "./execution-specification";
import {
  formatNegativeConstraintForProvider,
  type NegativeConstraintSpec,
} from "./requirement-enforcement";
import {
  readExecutionSpecFromMetadata,
  readExecutionSpecSnapshot,
} from "./execution-spec-snapshot";
import {
  hardConstraintConceptsFromSpec,
  requirementConstraintFingerprint,
  resolveProviderPromptConstraintStatus,
} from "./requirement-constraint-trace";

export type ForensicPromptStage =
  | "effective_instruction"
  | "append_output_requirements"
  | "route_visual_build"
  | "visual_director"
  | "visual_prompt_build"
  | "provider_adapter"
  | "provider_wire_request"
  | "enhance_prompt";

export type ForensicDiagnosis =
  | "REQUIREMENT_LOST_BEFORE_PROVIDER"
  | "REQUIREMENT_WEAKENED_BEFORE_PROVIDER"
  | "REQUIREMENT_REACHED_PROVIDER_BUT_MODEL_VIOLATED"
  | "MODEL_OUTPUT_NON_COMPLIANT_AND_EVALUATION_FAILED"
  | "EVALUATION_NOT_CAPABLE_OF_DETERMINING_COMPLIANCE";

export type ForensicRequirementRecord = Readonly<{
  concept: string;
  enforcement: "HARD_CONSTRAINT" | "SOFT_PREFERENCE";
  provenance: string;
  state: "ACTIVE";
  requirementId: string;
}>;

const CONFLICTING_VISUAL_MARKERS =
  /\b(leaf|leaves|foliage|botanical|plant|tree|recycling|recycle|eco[\-\s]?icon|sustainable|nature|green leaf)\b/i;

export function promptFingerprint(prompt: string): string {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function hardConstraintBlockPresent(prompt: string): boolean {
  return /\bhard constraint\b/i.test(prompt);
}

export function leafConstraintPresent(prompt: string): boolean {
  return /\bleaf\b|\bleaves\b|\bfoliage\b|\bbotanical\b/i.test(prompt);
}

export function detectConflictingVisualLanguage(prompt: string): readonly string[] {
  const creativeLines = prompt
    .split("\n")
    .filter(
      (line) =>
        !/\bhard constraint\b/i.test(line) &&
        !/\bdo not\b/i.test(line) &&
        !/\bnot include\b/i.test(line) &&
        !/\[User requirements — negative constraints\]/i.test(line),
    );
  const text = creativeLines.join("\n");
  const matches = text.match(new RegExp(CONFLICTING_VISUAL_MARKERS.source, "gi"));
  if (!matches?.length) return Object.freeze([]);
  return Object.freeze([...new Set(matches.map((m) => m.toLowerCase()))]);
}

export function auditPromptTransformation(input: {
  readonly stage: ForensicPromptStage;
  readonly inputPrompt: string;
  readonly outputPrompt: string;
  readonly spec?: CanonicalExecutionSpecification;
}): Readonly<{
  stage: ForensicPromptStage;
  inputHasHardConstraint: boolean;
  outputHasHardConstraint: boolean;
  inputLeafPresent: boolean;
  outputLeafPresent: boolean;
  conflictingMarkersIntroduced: readonly string[];
  constraintWeakened: boolean;
}> {
  const hardConcepts = hardConstraintConceptsFromSpec(input.spec);
  const inputHasHard = hardConstraintBlockPresent(input.inputPrompt);
  const outputHasHard = hardConstraintBlockPresent(input.outputPrompt);
  const inputSectionBeforeConstraints = input.inputPrompt.split(
    /\[User requirements — negative constraints\]/i,
  )[0] ?? input.inputPrompt;
  const outputCreativeSection = input.outputPrompt.split(
    /\[User requirements — negative constraints\]/i,
  )[0] ?? input.outputPrompt;
  const conflicting = detectConflictingVisualLanguage(outputCreativeSection).filter(
    (marker) =>
      hardConcepts.some((c) => c.includes("leaf") && /leaf|foliage|botanical|plant|tree/.test(marker)),
  );
  const constraintWeakened =
    hardConcepts.length > 0 &&
    ((inputHasHard && !outputHasHard) ||
      (leafConstraintPresent(input.inputPrompt) && !leafConstraintPresent(input.outputPrompt) && !outputHasHard) ||
      conflicting.length > 0);

  return Object.freeze({
    stage: input.stage,
    inputHasHardConstraint: inputHasHard,
    outputHasHardConstraint: outputHasHard,
    inputLeafPresent: leafConstraintPresent(input.inputPrompt),
    outputLeafPresent: leafConstraintPresent(input.outputPrompt),
    conflictingMarkersIntroduced: Object.freeze(conflicting),
    constraintWeakened,
  });
}

export function buildForensicRequirementRecords(
  spec?: CanonicalExecutionSpecification,
): readonly ForensicRequirementRecord[] {
  if (!spec) return Object.freeze([]);
  return Object.freeze(
    (spec.creative.negativeConstraints ?? [])
      .filter((c) => c.value.enforcement === "HARD_CONSTRAINT")
      .map((c) =>
        Object.freeze({
          concept: c.value.normalizedConcept,
          enforcement: "HARD_CONSTRAINT" as const,
          provenance: c.provenance.source,
          state: "ACTIVE" as const,
          requirementId: `negative.${c.value.normalizedConcept}`,
        }),
      ),
  );
}

export function sanitizeProviderWireBody(
  body: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const prompt =
    typeof body.prompt === "string"
      ? body.prompt
      : typeof body.text === "string"
        ? body.text
        : "";
  return Object.freeze({
    ...(typeof body.prompt === "string"
      ? {
          promptFingerprint: promptFingerprint(body.prompt),
          promptLength: body.prompt.length,
          hardConstraintPresent: hardConstraintBlockPresent(body.prompt),
          leafConstraintPresent: leafConstraintPresent(body.prompt),
        }
      : {}),
    ...(typeof body.rendering_speed === "string"
      ? { rendering_speed: body.rendering_speed }
      : {}),
    ...(typeof body.quality === "string" ? { quality: body.quality } : {}),
    ...(typeof body.size === "string" ? { size: body.size } : {}),
    hasReferenceImage: Boolean(body.image ?? body.image_url ?? body.reference),
  });
}

export function logForensicImageConstraintAudit(input: {
  readonly executionId?: string;
  readonly threadId?: string;
  readonly action?: string;
  readonly targetExecutionId?: string;
  readonly targetArtifactId?: string;
  readonly targetArtifactVersion?: string;
  readonly productAction?: string;
  readonly stage?: ForensicPromptStage;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly spec?: CanonicalExecutionSpecification;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityId?: string;
  readonly providerCapability?: string;
  readonly generationPath?: string;
  readonly fallbackUsed?: boolean;
  readonly referenceImageAttached?: boolean;
  readonly referenceInputPresent?: boolean;
  readonly referenceInputType?: string;
  readonly referenceAssetIds?: readonly string[];
  readonly visualOperationKind?: string;
  readonly prompt?: string;
  readonly providerWire?: Readonly<Record<string, unknown>>;
  readonly providerExecutionStatus?: string;
  readonly complianceStatus?: string;
  readonly complianceMethod?: string;
  readonly visualEvaluationMode?: string;
  readonly requirementComplianceStatus?: string;
  readonly violatedRequirementIds?: readonly string[];
  readonly transformation?: ReturnType<typeof auditPromptTransformation>;
}): void {
  const spec =
    input.spec ??
    readExecutionSpecFromMetadata(input.metadata) ??
    readExecutionSpecSnapshot(input.metadata)?.spec;
  const requirements = buildForensicRequirementRecords(spec);
  const handoff =
    input.prompt && spec
      ? resolveProviderPromptConstraintStatus({ prompt: input.prompt, spec })
      : undefined;

  const payload = Object.freeze({
    audit: "P4.9",
    ...(input.executionId ? { executionId: input.executionId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.targetExecutionId ? { target: input.targetExecutionId } : {}),
    ...(input.targetArtifactId ? { targetArtifactId: input.targetArtifactId } : {}),
    ...(input.targetArtifactVersion
      ? { targetArtifactVersion: input.targetArtifactVersion }
      : {}),
    ...(input.productAction ? { productAction: input.productAction } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.visualOperationKind ? { operation: input.visualOperationKind } : {}),
    planeVersion: spec?.planeVersion,
    negativeConstraintCount: spec?.creative.negativeConstraints?.length ?? 0,
    hardConstraintCount: requirements.length,
    requirements,
    ...(spec
      ? {
          hardConstraintFingerprint: requirementConstraintFingerprint(
            (spec.creative.negativeConstraints ?? []).map((c) => c.value),
          ),
        }
      : {}),
    ...(input.prompt
      ? {
          promptFingerprint: promptFingerprint(input.prompt),
          hardConstraintPresent: hardConstraintBlockPresent(input.prompt),
          leafConstraintPresent: leafConstraintPresent(input.prompt),
        }
      : {}),
    ...(handoff ? { providerHandoff: handoff } : {}),
    ...(input.providerId ? { provider: input.providerId } : {}),
    ...(input.modelId ? { model: input.modelId } : {}),
    ...(input.capabilityId ? { capability: input.capabilityId } : {}),
    ...(input.generationPath ? { generationPath: input.generationPath } : {}),
    ...(input.fallbackUsed !== undefined ? { fallbackUsed: input.fallbackUsed } : {}),
    ...(input.referenceImageAttached !== undefined
      ? { referenceImageAttached: input.referenceImageAttached }
      : {}),
    ...(input.referenceInputPresent !== undefined
      ? { referenceInputPresent: input.referenceInputPresent }
      : {}),
    ...(input.referenceInputType
      ? { referenceInputType: input.referenceInputType }
      : {}),
    ...(input.referenceAssetIds?.length
      ? { referenceAssetIds: input.referenceAssetIds }
      : {}),
    ...(input.providerCapability ? { providerCapability: input.providerCapability } : {}),
    ...(input.providerWire ? { providerWire: input.providerWire } : {}),
    ...(input.transformation
      ? {
          transformation: input.transformation,
          constraintWeakened: input.transformation.constraintWeakened,
        }
      : {}),
    ...(input.providerExecutionStatus
      ? { providerExecution: input.providerExecutionStatus }
      : {}),
    ...(input.complianceStatus ? { compliance: input.complianceStatus } : {}),
    ...(input.complianceMethod ? { complianceMethod: input.complianceMethod } : {}),
    ...(input.visualEvaluationMode
      ? { visualEvaluationMode: input.visualEvaluationMode }
      : {}),
    ...(input.requirementComplianceStatus
      ? { requirementComplianceStatus: input.requirementComplianceStatus }
      : {}),
    ...(input.violatedRequirementIds?.length
      ? { violatedRequirementIds: input.violatedRequirementIds }
      : {}),
  });
  console.info("[forensic-image-constraint]", JSON.stringify(payload));
}

export function classifyForensicDiagnosis(input: {
  readonly spec?: CanonicalExecutionSpecification;
  readonly finalProviderPrompt?: string;
  readonly creativeSectionPrompt?: string;
  readonly providerSucceeded?: boolean;
  readonly complianceStatus?: string;
  readonly complianceMethod?: string;
  readonly constraintWeakened?: boolean;
}): ForensicDiagnosis | undefined {
  const hard = hardConstraintConceptsFromSpec(input.spec);
  if (!hard.length) return undefined;

  if (!input.spec) return "REQUIREMENT_LOST_BEFORE_PROVIDER";

  const handoff = input.finalProviderPrompt
    ? resolveProviderPromptConstraintStatus({
        prompt: input.finalProviderPrompt,
        spec: input.spec,
      })
    : "MISSING";

  if (handoff === "MISSING") return "REQUIREMENT_LOST_BEFORE_PROVIDER";

  if (input.constraintWeakened) return "REQUIREMENT_WEAKENED_BEFORE_PROVIDER";

  const creativeSection =
    input.creativeSectionPrompt ??
    input.finalProviderPrompt?.split(/\[User requirements — negative constraints\]/i)[0] ??
    "";
  const creativeConflicts = detectConflictingVisualLanguage(creativeSection).filter(
    (m) => hard.some((c) => c.includes("leaf") && /leaf|foliage|botanical|plant|tree/.test(m)),
  );

  if (creativeConflicts.length > 0 && handoff === "PRESENT") {
    return "REQUIREMENT_WEAKENED_BEFORE_PROVIDER";
  }

  if (
    input.complianceStatus === "REQUIREMENT_COMPLIANCE_FAILURE" &&
    input.providerSucceeded
  ) {
    return "MODEL_OUTPUT_NON_COMPLIANT_AND_EVALUATION_FAILED";
  }

  if (
    input.complianceMethod === "NOT_AUTOMATED" ||
    input.complianceStatus === "NOT_EVALUATED"
  ) {
    if (input.providerSucceeded && handoff === "PRESENT") {
      return "REQUIREMENT_REACHED_PROVIDER_BUT_MODEL_VIOLATED";
    }
    return "EVALUATION_NOT_CAPABLE_OF_DETERMINING_COMPLIANCE";
  }

  if (input.providerSucceeded && handoff === "PRESENT") {
    return "REQUIREMENT_REACHED_PROVIDER_BUT_MODEL_VIOLATED";
  }

  return "REQUIREMENT_LOST_BEFORE_PROVIDER";
}

export function negativeConstraintBlockFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string {
  const spec = readExecutionSpecFromMetadata(metadata);
  if (!spec?.creative.negativeConstraints?.length) return "";
  const constraints = spec.creative.negativeConstraints.map((c) => c.value);
  return formatNegativeConstraintForProvider(constraints);
}

export function negativeConstraintBlockFromHandoff(
  metadata?: Readonly<Record<string, unknown>>,
): string {
  const raw = metadata?.executionSpecHandoff;
  if (!raw || typeof raw !== "object") return "";
  const spec = raw as CanonicalExecutionSpecification;
  const constraints = (spec.creative?.negativeConstraints ?? []).map(
    (c) => c.value as NegativeConstraintSpec,
  );
  return formatNegativeConstraintForProvider(constraints);
}

export function extractHardConstraintBlockFromInstruction(
  instruction?: string,
): string | undefined {
  const text = instruction?.trim();
  if (!text) return undefined;
  const idx = text.search(/\[User requirements — negative constraints\]/i);
  if (idx >= 0) return text.slice(idx).trim();
  if (/\bhard constraint\b/i.test(text)) {
    const lines = text.split("\n").filter((l) => /hard constraint/i.test(l));
    if (lines.length) return lines.join("\n");
  }
  return undefined;
}
