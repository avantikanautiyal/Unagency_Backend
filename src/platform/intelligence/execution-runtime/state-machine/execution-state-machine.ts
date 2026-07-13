/**
 * Execution state machine.
 *
 * Purpose: Enforce legal execution state transitions.
 * Responsibilities: transition validation and application.
 * Usage: Owned by ExecutionSession.
 * Future Extension: Side-effect hooks per transition.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import {
  canTransitionExecutionState,
  type ExecutionState,
} from "../contracts/execution-state";
import { ExecutionStateTransitionError } from "../errors";

export interface IExecutionStateMachine {
  readonly state: ExecutionState;
  transition(to: ExecutionState): Result<ExecutionState>;
  canTransition(to: ExecutionState): boolean;
}

export class ExecutionStateMachine implements IExecutionStateMachine {
  private current: ExecutionState;

  constructor(initial: ExecutionState = "created") {
    this.current = initial;
  }

  get state(): ExecutionState {
    return this.current;
  }

  canTransition(to: ExecutionState): boolean {
    return canTransitionExecutionState(this.current, to);
  }

  transition(to: ExecutionState): Result<ExecutionState> {
    if (!this.canTransition(to)) {
      return failure(
        new ExecutionStateTransitionError("Illegal execution state transition", {
          from: this.current,
          to,
        })
      );
    }
    this.current = to;
    return success(this.current);
  }
}
