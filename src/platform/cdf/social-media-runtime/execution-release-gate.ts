/**
 * TEMPORARY / NOT PRODUCTION-SAFE.
 *
 * Process-local stamp: Creative QA / governance release block for an execution.
 * Written at create finalize; read by CDF canonical-phase approve.
 *
 * This is an in-memory Map only — it does NOT survive process restarts and is
 * NOT shared across multi-instance deploys. Do not treat as durable governance.
 *
 * Durable release decisions belong on the execution evaluation/governance
 * record (execution extras) once a shared store lookup is wired into CDF
 * approve. Until then this module is an explicit temporary/test bridge only.
 */

export type ExecutionReleaseGateStamp = {
  readonly blocked: boolean;
  readonly creativeScore?: number | null;
  readonly reason?: string;
};

const stamps = new Map<string, ExecutionReleaseGateStamp>();

export function stampExecutionReleaseGate(
  executionId: string,
  stamp: ExecutionReleaseGateStamp,
): void {
  const id = executionId.trim();
  if (!id) return;
  stamps.set(id, stamp);
}

export function getExecutionReleaseGate(
  executionId: string | null | undefined,
): ExecutionReleaseGateStamp | undefined {
  if (!executionId?.trim()) return undefined;
  return stamps.get(executionId.trim());
}

/** Test helper */
export function resetExecutionReleaseGateForTests(): void {
  stamps.clear();
}
