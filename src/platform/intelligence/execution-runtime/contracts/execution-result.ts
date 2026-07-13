/**
 * Terminal execution result (placeholder — no provider output).
 */

import type { ExecutionState } from "./execution-state";

export interface ExecutionResult {
  readonly sessionId: string;
  readonly state: ExecutionState;
  readonly success: boolean;
  readonly message?: string;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly completedAt: string;
}
