/**
 * Tool execution env / bounds — credential-free defaults.
 */

export interface ToolExecutionConfig {
  readonly enabled: boolean;
  readonly maxRounds: number;
  readonly maxCallsPerExecution: number;
  readonly maxCallsPerRound: number;
  readonly executionTimeoutMs: number;
  readonly requireApprovalForSideEffects: boolean;
}

export function loadToolExecutionConfig(
  env: NodeJS.ProcessEnv = process.env
): ToolExecutionConfig {
  return {
    enabled: parseBool(env.TOOL_EXECUTION_ENABLED, true),
    maxRounds: parseIntBound(env.TOOL_MAX_ROUNDS, 5, 1, 20),
    maxCallsPerExecution: parseIntBound(env.TOOL_MAX_CALLS_PER_EXECUTION, 20, 1, 100),
    maxCallsPerRound: parseIntBound(env.TOOL_MAX_CALLS_PER_ROUND, 5, 1, 20),
    executionTimeoutMs: parseIntBound(env.TOOL_EXECUTION_TIMEOUT_MS, 5_000, 100, 120_000),
    requireApprovalForSideEffects: parseBool(env.TOOL_REQUIRE_APPROVAL_FOR_SIDE_EFFECTS, true),
  };
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

function parseIntBound(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
