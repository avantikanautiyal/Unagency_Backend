/**
 * P4.9.5 — Execution specification provenance diagnostics (no raw prompts).
 */

import type { CanonicalExecutionSpecification } from "./execution-specification";
import {
  readExecutionSpecSnapshot,
  executionSpecObservabilitySummary,
} from "./execution-spec-snapshot";

export type ExecutionSpecProvenanceSource =
  | "conversational_resolution"
  | "client_handoff"
  | "inherited_parent"
  | "persisted_snapshot"
  | "none";

export function resolveExecutionSpecProvenance(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly conversationSpec?: CanonicalExecutionSpecification;
  readonly inheritedFromParent?: boolean;
}): {
  source: ExecutionSpecProvenanceSource;
  snapshotPresent: boolean;
  handoffPresent: boolean;
  snapshotId?: string;
  planeVersion?: string;
} {
  const metadata = input.metadata ?? {};
  const snapshot = readExecutionSpecSnapshot(metadata);
  const handoffPresent = Boolean(
    metadata.executionSpecHandoff &&
      typeof metadata.executionSpecHandoff === "object",
  );

  if (input.conversationSpec) {
    return {
      source: "conversational_resolution",
      snapshotPresent: Boolean(snapshot),
      handoffPresent,
      ...(snapshot?.snapshotId ? { snapshotId: snapshot.snapshotId } : {}),
      planeVersion: input.conversationSpec.planeVersion,
    };
  }
  if (handoffPresent) {
    return {
      source: "client_handoff",
      snapshotPresent: Boolean(snapshot),
      handoffPresent: true,
      ...(snapshot?.snapshotId ? { snapshotId: snapshot.snapshotId } : {}),
      planeVersion:
        typeof (metadata.executionSpecHandoff as { planeVersion?: unknown })
          ?.planeVersion === "string"
          ? String(
              (metadata.executionSpecHandoff as { planeVersion: string })
                .planeVersion,
            )
          : snapshot?.planeVersion,
    };
  }
  if (input.inheritedFromParent && snapshot) {
    return {
      source: "inherited_parent",
      snapshotPresent: true,
      handoffPresent: false,
      snapshotId: snapshot.snapshotId,
      planeVersion: snapshot.planeVersion,
    };
  }
  if (snapshot) {
    return {
      source: "persisted_snapshot",
      snapshotPresent: true,
      handoffPresent: false,
      snapshotId: snapshot.snapshotId,
      planeVersion: snapshot.planeVersion,
    };
  }
  return {
    source: "none",
    snapshotPresent: false,
    handoffPresent: false,
  };
}

export function executionSpecProvenanceObservability(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly conversationSpec?: CanonicalExecutionSpecification;
  readonly inheritedFromParent?: boolean;
}): Readonly<Record<string, unknown>> {
  const provenance = resolveExecutionSpecProvenance(input);
  const spec =
    input.conversationSpec ??
    readExecutionSpecSnapshot(input.metadata)?.spec;
  return Object.freeze({
    ...executionSpecObservabilitySummary(spec),
    executionSpecSource: provenance.source,
    executionSpecSnapshotPresent: provenance.snapshotPresent,
    executionSpecHandoffPresent: provenance.handoffPresent,
    ...(provenance.snapshotId
      ? { executionSpecId: provenance.snapshotId }
      : {}),
    ...(provenance.planeVersion
      ? { executionSpecPlaneVersion: provenance.planeVersion }
      : {}),
  });
}
