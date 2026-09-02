/**
 * Priority 4.6.1 — Immutable execution specification snapshots for production lifecycle.
 * Snapshots are frozen at execution create time and must not mutate with later turns.
 */

import type { CanonicalExecutionSpecification } from "./execution-specification";
import { constraintObservabilitySummary } from "./requirement-enforcement";
import { EXECUTION_RESOLUTION_PLANE_VERSION } from "./execution-specification";

export type ExecutionSpecSnapshot = {
  readonly snapshotId: string;
  readonly executionId: string;
  readonly snapshotAt: string;
  readonly planeVersion: typeof EXECUTION_RESOLUTION_PLANE_VERSION;
  readonly spec: CanonicalExecutionSpecification;
};

export function freezeExecutionSpecSnapshot(input: {
  readonly executionId: string;
  readonly spec: CanonicalExecutionSpecification;
  readonly nowIso?: string;
  readonly createId?: (prefix: string) => string;
}): ExecutionSpecSnapshot {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  return Object.freeze({
    snapshotId: createId("execspec"),
    executionId: input.executionId,
    snapshotAt: nowIso,
    planeVersion: input.spec.planeVersion,
    spec: Object.freeze(JSON.parse(JSON.stringify(input.spec)) as CanonicalExecutionSpecification),
  });
}

export function readExecutionSpecSnapshot(
  metadata?: Readonly<Record<string, unknown>>,
): ExecutionSpecSnapshot | undefined {
  const raw = metadata?.executionSpecSnapshot;
  if (!raw || typeof raw !== "object") return undefined;
  const snap = raw as ExecutionSpecSnapshot;
  if (!snap.spec || typeof snap.executionId !== "string") return undefined;
  return snap;
}

export function readExecutionSpecFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): CanonicalExecutionSpecification | undefined {
  return readExecutionSpecSnapshot(metadata)?.spec;
}

export function resolveBriefObjectiveFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
  fallbackPrompt?: string,
): string | undefined {
  const spec = readExecutionSpecFromMetadata(metadata);
  if (spec?.executionInstruction?.trim()) {
    return spec.executionInstruction.trim().slice(0, 500);
  }
  const conversational =
    typeof metadata?.conversationalEffectiveInstruction === "string"
      ? metadata.conversationalEffectiveInstruction.trim()
      : "";
  if (conversational) return conversational.slice(0, 500);
  const prompt = fallbackPrompt?.trim();
  return prompt ? prompt.slice(0, 500) : undefined;
}

/** Stamp denormalized + full snapshot fields onto execution metadata. */
export function stampExecutionSpecMetadata(
  metadata: Record<string, unknown>,
  input: {
    readonly executionId: string;
    readonly spec: CanonicalExecutionSpecification;
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  },
): Record<string, unknown> {
  const snapshot = freezeExecutionSpecSnapshot({
    executionId: input.executionId,
    spec: input.spec,
    nowIso: input.nowIso?.(),
    createId: input.createId,
  });
  return Object.freeze({
    ...metadata,
    executionSpecSnapshot: snapshot,
    executionSpecPlaneVersion: input.spec.planeVersion,
    executionSpecResolutionState: input.spec.resolutionState,
    executionSpecOutputMode: input.spec.outputIntent.mode.value,
    executionSpecDeliverables: input.spec.deliverables.map((d) => d.format),
    executionSpecQuantity: input.spec.content.quantity?.value,
    executionSpecFinalMode: input.spec.outputIntent.mode.value === "FINAL",
    conversationalEffectiveInstruction: input.spec.executionInstruction,
    executionSpecNegativeConstraintCount:
      input.spec.creative.negativeConstraints?.length ?? 0,
    executionSpecHardConstraintCount:
      input.spec.creative.negativeConstraints?.filter(
        (c) => c.value.enforcement === "HARD_CONSTRAINT",
      ).length ?? 0,
  });
}

export function executionSpecObservabilitySummary(
  spec?: CanonicalExecutionSpecification,
): Readonly<Record<string, unknown>> {
  if (!spec) {
    return Object.freeze({ executionSpecAvailable: false });
  }
  return Object.freeze({
    executionSpecAvailable: true,
    planeVersion: spec.planeVersion,
    resolutionState: spec.resolutionState,
    action: spec.task.action?.value,
    outputMode: spec.outputIntent.mode.value,
    outputModeExplicit: spec.outputIntent.mode.provenance.explicit,
    quantity: spec.content.quantity?.value,
    quantityExplicit: spec.content.quantity?.provenance.explicit,
    deliverables: spec.deliverables.map((d) => ({
      format: d.format,
      explicit: d.provenance.explicit,
      required: d.required,
    })),
    deliverableCount: spec.deliverables.length,
    contentItemCount: spec.content.contentItems?.length ?? 0,
    dimensions:
      spec.technical.width?.value && spec.technical.height?.value
        ? `${spec.technical.width.value}x${spec.technical.height.value}`
        : undefined,
    pageCount: spec.technical.pageCount?.value,
    ...constraintObservabilitySummary(
      (spec.creative.negativeConstraints ?? []).map((c) => c.value),
    ),
  });
}

export function requirementComplianceObservabilitySummary(
  report?: {
    readonly overallStatus: string;
    readonly results: readonly { readonly checkId: string; readonly status: string }[];
  },
): Readonly<Record<string, unknown>> {
  if (!report) {
    return Object.freeze({ requirementComplianceAvailable: false });
  }
  const failures = report.results.filter((r) => r.status === "FAIL");
  return Object.freeze({
    requirementComplianceAvailable: true,
    complianceStatus: report.overallStatus,
    requirementComplianceStatus:
      "requirementComplianceStatus" in report
        ? report.requirementComplianceStatus
        : report.overallStatus === "COMPLIANT"
          ? "COMPLIANT"
          : "REQUIREMENT_COMPLIANCE_FAILURE",
    complianceFailureCount: failures.length,
    complianceFailureCodes: failures.map((f) => f.checkId),
    violatedRequirementIds: failures.map((f) => f.checkId),
  });
}
