/**
 * Execution Optimization branded identifiers.
 */

export type ExecutionOptimizationResultId = string & {
  readonly __brand: "ExecutionOptimizationResultId";
};

export type OptimizationSnapshotId = string & {
  readonly __brand: "OptimizationSnapshotId";
};

export function asExecutionOptimizationResultId(
  value: string
): ExecutionOptimizationResultId {
  if (!value.trim()) throw new Error("ExecutionOptimizationResultId cannot be empty");
  return value as ExecutionOptimizationResultId;
}

export function asOptimizationSnapshotId(value: string): OptimizationSnapshotId {
  if (!value.trim()) throw new Error("OptimizationSnapshotId cannot be empty");
  return value as OptimizationSnapshotId;
}
