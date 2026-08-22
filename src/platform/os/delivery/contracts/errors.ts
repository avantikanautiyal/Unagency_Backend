/**
 * Phase 7 delivery errors.
 */

export type DeliveryErrorCode =
  | "TENANT_VIOLATION"
  | "ARTIFACT_NOT_FOUND"
  | "NOT_APPROVED"
  | "VERSION_MISMATCH"
  | "REVOKED"
  | "DESTINATION_UNAUTHORIZED"
  | "DELIVERY_FAILED"
  | "DENY";

export class DeliveryError extends Error {
  readonly code: DeliveryErrorCode;

  constructor(code: DeliveryErrorCode, message: string) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
  }
}
