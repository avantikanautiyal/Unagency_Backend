/**
 * P4.8.1 — Narrow observability for canonical requirement → provider handoff.
 * Logs fingerprints only — never full prompts or conversation text.
 */

import type { CanonicalExecutionSpecification } from "./execution-specification";
import type { NegativeConstraintSpec } from "./execution-specification";
import {
  constraintObservabilitySummary,
  formatNegativeConstraintForProvider,
} from "./requirement-enforcement";
import {
  readExecutionSpecFromMetadata,
  readExecutionSpecSnapshot,
} from "./execution-spec-snapshot";

export type RequirementHandoffStatus = "PRESENT" | "MISSING" | "NOT_APPLICABLE";

export type RequirementTracePhase =
  | "EXECUTION_SPEC"
  | "PROVIDER_HANDOFF"
  | "FINAL_PROVIDER_REQUEST"
  | "MODEL_RESULT"
  | "COMPLIANCE";

export type RequirementFailureBoundary =
  | "REQUIREMENT_LOST_IN_ORCHESTRATION"
  | "REQUIREMENT_LOST_IN_PROVIDER_HANDOFF"
  | "REQUIREMENT_PASSED_TO_MODEL_BUT_MODEL_VIOLATED"
  | "REQUIREMENT_REACHED_ARTIFACT_BUT_COMPLIANCE_FAILED"
  | "EVALUATION_NOT_CAPABLE_OF_DETECTING_VIOLATION";

export function isRouteVisualProductAction(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  const action =
    typeof metadata?.productAction === "string"
      ? metadata.productAction.trim().toLowerCase()
      : "";
  return action === "route_visual" || action === "route_visual_refine";
}

export function requirementConstraintFingerprint(
  constraints: readonly NegativeConstraintSpec[],
): string {
  if (!constraints.length) return "";
  return constraints
    .map((c) => `${c.normalizedConcept}:${c.enforcement}`)
    .sort()
    .join("|");
}

export function hardConstraintConceptsFromSpec(
  spec?: CanonicalExecutionSpecification,
): readonly string[] {
  return Object.freeze(
    (spec?.creative.negativeConstraints ?? [])
      .filter((c) => c.value.enforcement === "HARD_CONSTRAINT")
      .map((c) => c.value.normalizedConcept),
  );
}

export function resolveProviderPromptConstraintStatus(input: {
  readonly prompt: string;
  readonly spec?: CanonicalExecutionSpecification;
}): RequirementHandoffStatus {
  const hard = hardConstraintConceptsFromSpec(input.spec);
  if (!hard.length) return "NOT_APPLICABLE";
  const promptLower = input.prompt.toLowerCase();
  if (!promptLower.includes("hard constraint")) return "MISSING";
  for (const concept of hard) {
    const token = concept.replace(/_/g, " ").split(" ")[0] ?? concept;
    if (token.length >= 3 && !promptLower.includes(token)) {
      return "MISSING";
    }
  }
  return "PRESENT";
}

export function executionSpecTraceSummary(
  spec?: CanonicalExecutionSpecification,
): Readonly<Record<string, unknown>> {
  if (!spec) {
    return Object.freeze({ executionSpecAvailable: false });
  }
  const hard = (spec.creative.negativeConstraints ?? []).filter(
    (c) => c.value.enforcement === "HARD_CONSTRAINT",
  );
  return Object.freeze({
    executionSpecAvailable: true,
    hardConstraintFingerprint: requirementConstraintFingerprint(
      hard.map((c) => c.value),
    ),
    hardConstraintConcepts: hard.map((c) => c.value.normalizedConcept),
    ...constraintObservabilitySummary(
      (spec.creative.negativeConstraints ?? []).map((c) => c.value),
    ),
  });
}

export function logRequirementConstraintTrace(input: {
  readonly phase: RequirementTracePhase;
  readonly executionId?: string;
  readonly productAction?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly spec?: CanonicalExecutionSpecification;
  readonly prompt?: string;
  readonly providerExecutionStatus?: string;
  readonly complianceStatus?: string;
}): void {
  const spec =
    input.spec ??
    readExecutionSpecFromMetadata(input.metadata) ??
    readExecutionSpecSnapshot(input.metadata)?.spec;
  const summary = executionSpecTraceSummary(spec);
  const handoff =
    input.prompt && spec
      ? resolveProviderPromptConstraintStatus({ prompt: input.prompt, spec })
      : undefined;
  const payload = Object.freeze({
    phase: input.phase,
    ...(input.executionId ? { executionId: input.executionId } : {}),
    ...(input.productAction ? { productAction: input.productAction } : {}),
    ...summary,
    ...(handoff ? { providerHandoff: handoff } : {}),
    ...(input.providerExecutionStatus
      ? { providerExecution: input.providerExecutionStatus }
      : {}),
    ...(input.complianceStatus ? { compliance: input.complianceStatus } : {}),
  });
  console.info("[requirement-constraint-trace]", JSON.stringify(payload));
}

export { appendOutputRequirementsToPrompt as resolveFinalProviderFacingPrompt } from "../../direct/append-output-requirements";

export function classifyRequirementFailureBoundary(input: {
  readonly spec?: CanonicalExecutionSpecification;
  readonly finalProviderPrompt?: string;
  readonly providerSucceeded?: boolean;
  readonly complianceStatus?: string;
  readonly complianceMethod?: string;
}): RequirementFailureBoundary | undefined {
  if (!input.spec) return "REQUIREMENT_LOST_IN_ORCHESTRATION";

  const hard = hardConstraintConceptsFromSpec(input.spec);
  if (!hard.length) return undefined;

  const handoff = input.finalProviderPrompt
    ? resolveProviderPromptConstraintStatus({
        prompt: input.finalProviderPrompt,
        spec: input.spec,
      })
    : "MISSING";
  if (handoff === "MISSING") return "REQUIREMENT_LOST_IN_PROVIDER_HANDOFF";
  if (input.providerSucceeded && input.complianceStatus === "NOT_EVALUATED") {
    return "EVALUATION_NOT_CAPABLE_OF_DETECTING_VIOLATION";
  }
  if (
    input.complianceMethod === "NOT_AUTOMATED" &&
    input.providerSucceeded
  ) {
    return "EVALUATION_NOT_CAPABLE_OF_DETECTING_VIOLATION";
  }
  if (
    input.complianceStatus === "REQUIREMENT_COMPLIANCE_FAILURE" &&
    input.providerSucceeded
  ) {
    return "REQUIREMENT_PASSED_TO_MODEL_BUT_MODEL_VIOLATED";
  }
  if (input.providerSucceeded && handoff === "PRESENT") {
    return "REQUIREMENT_PASSED_TO_MODEL_BUT_MODEL_VIOLATED";
  }
  return "REQUIREMENT_LOST_IN_ORCHESTRATION";
}

/** Stable block appended to provider prompts — used by tests for semantic presence. */
export function providerConstraintBlockFromSpec(
  spec?: CanonicalExecutionSpecification,
): string {
  const constraints = (spec?.creative.negativeConstraints ?? []).map(
    (c) => c.value,
  );
  return formatNegativeConstraintForProvider(constraints);
}
