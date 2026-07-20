/**
 * Lifecycle transitions for secrets.
 */

import type { SecretLifecycleState } from "../contracts/enums";
import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";

const ALLOWED: Record<SecretLifecycleState, readonly SecretLifecycleState[]> = {
  created: ["validated", "active", "deleted"],
  validated: ["active", "revoked", "deleted"],
  active: ["rotating", "expired", "revoked", "archived", "deleted"],
  rotating: ["active", "revoked"],
  expired: ["revoked", "archived", "deleted", "active"],
  revoked: ["deleted", "archived"],
  deleted: [],
  archived: ["deleted"],
};

export function canTransition(
  from: SecretLifecycleState,
  to: SecretLifecycleState
): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionLifecycle(
  from: SecretLifecycleState,
  to: SecretLifecycleState
): Result<SecretLifecycleState> {
  if (from === to) return success(to);
  if (!canTransition(from, to)) {
    return failure(
      new ValidationError(`invalid lifecycle transition ${from} → ${to}`)
    );
  }
  return success(to);
}
