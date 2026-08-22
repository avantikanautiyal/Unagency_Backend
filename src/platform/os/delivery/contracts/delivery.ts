/**
 * Phase 7 — Delivery contracts (approval-gated, version-bound).
 */

export type DeliveryDestination =
  | "export"
  | "storage"
  | "webhook"
  | "email"
  | "cms"
  | "social"
  | "ecommerce"
  | "website";

export type DeliveryStatus =
  | "QUEUED"
  | "AUTHORIZED"
  | "DENIED"
  | "STARTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface DeliveryReceipt {
  readonly deliveryId: string;
  readonly organizationId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly executionId: string;
  readonly planVersion?: number;
  readonly destination: DeliveryDestination;
  readonly status: DeliveryStatus;
  readonly externalReference?: string;
  readonly timestamp: string;
  readonly checksum?: string;
  readonly failureReason?: string;
  readonly idempotencyKey: string;
  readonly approvalReference?: string;
}

export interface DeliveryAuthorizationResult {
  readonly authorized: boolean;
  readonly reason: string;
  readonly approvalReference?: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
}

export interface IDeliveryAdapter {
  readonly destination: DeliveryDestination;
  deliver(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly preview?: string;
    readonly checksum?: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly externalReference: string; readonly ok: boolean; readonly error?: string }>;
}
