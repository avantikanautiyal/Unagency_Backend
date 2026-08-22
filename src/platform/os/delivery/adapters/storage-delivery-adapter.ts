/**
 * Phase 8 — Storage delivery adapter.
 * Wraps canonical blob/storage identity; no vendor SDK in the OS layer.
 */

import type {
  DeliveryDestination,
  IDeliveryAdapter,
} from "../contracts/delivery";

export class StorageDeliveryAdapter implements IDeliveryAdapter {
  readonly destination: DeliveryDestination = "storage";
  private readonly delivered = new Map<string, string>();

  async deliver(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly preview?: string;
    readonly checksum?: string;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly externalReference: string;
    readonly ok: boolean;
    readonly error?: string;
  }> {
    const existing = this.delivered.get(input.idempotencyKey);
    if (existing) {
      return { externalReference: existing, ok: true };
    }
    const ref = `storage://${input.organizationId}/${input.artifactId}/v${input.artifactVersion}/${input.checksum ?? "na"}`;
    this.delivered.set(input.idempotencyKey, ref);
    return { externalReference: ref, ok: true };
  }
}
