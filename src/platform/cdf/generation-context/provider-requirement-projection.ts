/**
 * Typed provider requirement projection.
 *
 * Single authority for projecting ExecutionSpec hard constraints onto the
 * provider wire — never silently drop HARD_CONSTRAINT values when a CMR path
 * skips legacy appendOutputRequirementsToPrompt.
 *
 * Forensic hashes prove survival across:
 *   ExecutionSpec → CMR flatten / projection → provider wire prompt
 */

import { createHash } from "node:crypto";
import type { CanonicalExecutionSpecification } from "../../collaboration/conversational-task-intelligence/execution-specification";
import {
  formatNegativeConstraintForProvider,
  negativeConstraintInstruction,
} from "../../collaboration/conversational-task-intelligence/requirement-enforcement";
import { readExecutionSpecFromMetadata } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import { requirementConstraintFingerprint } from "../../collaboration/conversational-task-intelligence/requirement-constraint-trace";

export type ProviderRequirementProjection = {
  /** Normalized HARD CONSTRAINT block for provider prompts. */
  readonly providerConstraintBlock: string;
  readonly hardConstraintCount: number;
  readonly softPreferenceCount: number;
  readonly hardConstraintConcepts: readonly string[];
  readonly executionSpecConstraintHash: string;
  readonly canonicalModelRequestConstraintHash: string;
  readonly providerWireConstraintHash: string;
  /** True when ExecutionSpec had HARD constraints that are present in wire text. */
  readonly hardConstraintsSurvivedToWire: boolean;
  /**
   * When hard constraints exist but cannot be represented for a provider,
   * capability/routing must surface this — never silent drop.
   */
  readonly representationFailure?: {
    readonly code: "PROVIDER_CANNOT_REPRESENT_HARD_CONSTRAINT";
    readonly message: string;
  };
};

function sha16(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Project ExecutionSpec negative constraints into a typed provider wire block
 * and forensic hashes. CMR text (when present) is included in the CMR hash.
 */
export function projectProviderRequirements(input: {
  readonly executionSpec?: CanonicalExecutionSpecification | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  /** Flattened CMR prompt body (constraints/exclusions sections when present). */
  readonly canonicalModelRequestText?: string | null;
  /** Final provider wire prompt (after projection merge). */
  readonly providerWirePrompt?: string | null;
}): ProviderRequirementProjection {
  const spec =
    input.executionSpec ??
    readExecutionSpecFromMetadata(input.metadata ?? undefined);
  const negatives = (spec?.creative.negativeConstraints ?? []).map((c) => c.value);
  const hard = negatives.filter((c) => c.enforcement === "HARD_CONSTRAINT");
  const soft = negatives.filter((c) => c.enforcement === "SOFT_PREFERENCE");
  const block = formatNegativeConstraintForProvider(negatives);
  const concepts = hard.map((c) => c.normalizedConcept);
  const execHash =
    hard.length > 0 ? sha16(requirementConstraintFingerprint(hard)) : sha16("");

  const cmrText = (input.canonicalModelRequestText ?? "").trim();
  const cmrHash = sha16(cmrText);

  const wirePrompt = (input.providerWirePrompt ?? "").trim();
  const wireWithBlock =
    block && wirePrompt && !/hard\s+constraint/i.test(wirePrompt)
      ? `${wirePrompt}\n\n${block}`
      : wirePrompt || block;
  const wireHash = sha16(wireWithBlock);

  const hardConstraintsSurvivedToWire =
    hard.length === 0 ||
    (Boolean(block) &&
      /hard\s+constraint/i.test(wireWithBlock) &&
      concepts.every((concept) => {
        const token = concept.replace(/_/g, " ");
        return (
          wireWithBlock.toLowerCase().includes(concept.toLowerCase()) ||
          wireWithBlock.toLowerCase().includes(token.toLowerCase()) ||
          hard.some(
            (h) =>
              h.normalizedConcept === concept &&
              wireWithBlock.toLowerCase().includes(h.subject.toLowerCase()),
          )
        );
      }));

  let representationFailure:
    | ProviderRequirementProjection["representationFailure"]
    | undefined;
  if (hard.length > 0 && !hardConstraintsSurvivedToWire) {
    representationFailure = {
      code: "PROVIDER_CANNOT_REPRESENT_HARD_CONSTRAINT",
      message:
        "ExecutionSpec HARD_CONSTRAINT values could not be proven on the provider wire",
    };
  }

  return {
    providerConstraintBlock: block,
    hardConstraintCount: hard.length,
    softPreferenceCount: soft.length,
    hardConstraintConcepts: concepts,
    executionSpecConstraintHash: execHash,
    canonicalModelRequestConstraintHash: cmrHash,
    providerWireConstraintHash: wireHash,
    hardConstraintsSurvivedToWire,
    ...(representationFailure ? { representationFailure } : {}),
  };
}

/**
 * Merge ExecutionSpec HARD constraint block into a CMR-derived prompt when
 * the block is not already present. Does not invent soft preferences.
 */
export function mergeHardConstraintsIntoProviderPrompt(input: {
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly executionSpec?: CanonicalExecutionSpecification | null;
}): {
  readonly prompt: string;
  readonly projection: ProviderRequirementProjection;
  readonly merged: boolean;
} {
  const base = input.prompt ?? "";
  const spec =
    input.executionSpec ??
    readExecutionSpecFromMetadata(input.metadata ?? undefined);
  const negatives =
    spec?.creative.negativeConstraints?.map((c) => c.value) ?? [];
  const hardLines = negativeConstraintInstruction(negatives).filter((line) =>
    line.startsWith("HARD CONSTRAINT"),
  );
  const projectionProbe = projectProviderRequirements({
    executionSpec: spec,
    metadata: input.metadata,
    canonicalModelRequestText: base,
    providerWirePrompt: base,
  });
  if (projectionProbe.hardConstraintCount === 0) {
    return { prompt: base, projection: projectionProbe, merged: false };
  }
  if (
    hardLines.length > 0 &&
    hardLines.every((line) => base.includes(line))
  ) {
    return { prompt: base, projection: projectionProbe, merged: false };
  }
  const block = projectionProbe.providerConstraintBlock;
  const mergedPrompt = `${base.trim()}\n\n${block}`.trim();
  const projection = projectProviderRequirements({
    executionSpec: spec,
    metadata: input.metadata,
    canonicalModelRequestText: base,
    providerWirePrompt: mergedPrompt,
  });
  return { prompt: mergedPrompt, projection, merged: true };
}
