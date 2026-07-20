/**
 * Validation helpers for secrets.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { SecretType } from "../contracts/enums";
import type { StoreSecretInput } from "../contracts/secret";

const MIN_LENGTH: Partial<Record<SecretType, number>> = {
  ai_provider_key: 8,
  jwt_secret: 16,
  encryption_key: 16,
  signing_key: 16,
  webhook_secret: 8,
  oauth_credential: 8,
  database_credential: 4,
  smtp_credential: 4,
  storage_credential: 4,
  third_party_api_key: 8,
  certificate: 20,
  tenant_secret: 8,
};

export function validateSecretInput(input: StoreSecretInput): Result<void> {
  if (!input.name?.trim()) {
    return failure(new ValidationError("name is required"));
  }
  if (!input.value?.trim()) {
    return failure(new ValidationError("value is required"));
  }
  const min = MIN_LENGTH[input.type] ?? 4;
  if (input.value.length < min) {
    return failure(
      new ValidationError(`secret value must be at least ${min} characters for ${input.type}`)
    );
  }
  return success(undefined);
}

export function isExpired(expiresAt: string | undefined, nowIso: string): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.parse(nowIso);
}

export function isNearExpiration(
  expiresAt: string | undefined,
  nowIso: string,
  windowMs: number
): boolean {
  if (!expiresAt) return false;
  const remaining = Date.parse(expiresAt) - Date.parse(nowIso);
  return remaining > 0 && remaining <= windowMs;
}
