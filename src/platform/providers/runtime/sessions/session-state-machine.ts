/**
 * Provider execution session state machine.
 *
 * Purpose: Enforce legal provider execution status transitions.
 * Responsibilities: Validate and apply transitions.
 * Usage: Owned by ProviderExecutionSession.
 * Future Extension: Transition side-effect hooks.
 */

import { failure, success } from "../../../core/result";
import type { Result } from "../../../core/result";
import {
  canTransitionProviderExecutionStatus,
  type ProviderExecutionStatus,
} from "../contracts/provider-execution-status";
import { ProviderExecutionStatusError } from "../errors";

export interface ISessionStateMachine {
  readonly status: ProviderExecutionStatus;
  canTransition(to: ProviderExecutionStatus): boolean;
  transition(to: ProviderExecutionStatus): Result<ProviderExecutionStatus>;
}

export class SessionStateMachine implements ISessionStateMachine {
  private current: ProviderExecutionStatus;

  constructor(initial: ProviderExecutionStatus = "created") {
    this.current = initial;
  }

  get status(): ProviderExecutionStatus {
    return this.current;
  }

  canTransition(to: ProviderExecutionStatus): boolean {
    return canTransitionProviderExecutionStatus(this.current, to);
  }

  transition(to: ProviderExecutionStatus): Result<ProviderExecutionStatus> {
    if (!this.canTransition(to)) {
      return failure(
        new ProviderExecutionStatusError(
          "Illegal provider execution status transition",
          { from: this.current, to }
        )
      );
    }
    this.current = to;
    return success(this.current);
  }
}
