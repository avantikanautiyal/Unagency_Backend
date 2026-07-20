/**
 * Generic rotation engine — provider-agnostic.
 */

import { randomBytes } from "crypto";
import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { RotateSecretInput, SecretRecord } from "../contracts/secret";
import { transitionLifecycle } from "../lifecycle/lifecycle";

export interface RotationEngineHooks {
  readonly getRecord: (secretId: string) => SecretRecord | undefined;
  readonly setLifecycle: (
    secretId: string,
    lifecycle: SecretRecord["lifecycle"]
  ) => Result<SecretRecord>;
  readonly writeNewValue: (
    secretId: string,
    newValue: string,
    actor?: string
  ) => Promise<Result<SecretRecord>>;
  readonly onFailure?: () => void;
}

export async function rotateSecretRecord(
  input: RotateSecretInput,
  hooks: RotationEngineHooks
): Promise<Result<SecretRecord>> {
  const existing = hooks.getRecord(String(input.secretId));
  if (!existing) {
    return failure(new ValidationError("secret not found"));
  }
  if (existing.lifecycle === "deleted" || existing.lifecycle === "revoked") {
    return failure(new ValidationError(`cannot rotate secret in state ${existing.lifecycle}`));
  }

  const toRotating = transitionLifecycle(existing.lifecycle, "rotating");
  if (!toRotating.ok) return toRotating;
  const marked = hooks.setLifecycle(String(input.secretId), "rotating");
  if (!marked.ok) return marked;

  const newValue =
    input.newValue ?? randomBytes(24).toString("base64url");

  const written = await hooks.writeNewValue(
    String(input.secretId),
    newValue,
    input.actor
  );
  if (!written.ok) {
    hooks.onFailure?.();
    hooks.setLifecycle(String(input.secretId), existing.lifecycle);
    return written;
  }

  const activate = hooks.setLifecycle(String(input.secretId), "active");
  if (!activate.ok) return activate;
  return activate;
}
