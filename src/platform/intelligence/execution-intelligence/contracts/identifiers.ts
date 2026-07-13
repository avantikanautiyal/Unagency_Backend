/**
 * Execution Intelligence branded identifiers.
 */

export type ExecutionIntelligenceResultId = string & {
  readonly __brand: "ExecutionIntelligenceResultId";
};

export type ExecutionSnapshotId = string & {
  readonly __brand: "ExecutionSnapshotId";
};

export function asExecutionIntelligenceResultId(
  value: string
): ExecutionIntelligenceResultId {
  if (!value.trim()) {
    throw new Error("ExecutionIntelligenceResultId cannot be empty");
  }
  return value as ExecutionIntelligenceResultId;
}

export function asExecutionSnapshotId(value: string): ExecutionSnapshotId {
  if (!value.trim()) {
    throw new Error("ExecutionSnapshotId cannot be empty");
  }
  return value as ExecutionSnapshotId;
}
