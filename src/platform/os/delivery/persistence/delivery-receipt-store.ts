/**
 * Phase 8 — Durable delivery receipt store (idempotent by key).
 */

import type { DeliveryReceipt } from "../contracts/delivery";

export interface IDeliveryReceiptStore {
  getByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined>;
  get(
    deliveryId: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined>;
  save(receipt: DeliveryReceipt): Promise<DeliveryReceipt>;
}

export class InMemoryDeliveryReceiptStore implements IDeliveryReceiptStore {
  private readonly byId = new Map<string, DeliveryReceipt>();
  private readonly byIdem = new Map<string, string>();

  clear(): void {
    this.byId.clear();
    this.byIdem.clear();
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined> {
    const id = this.byIdem.get(idempotencyKey);
    if (!id) return undefined;
    const r = this.byId.get(id);
    if (!r || r.organizationId !== organizationId) return undefined;
    return r;
  }

  async get(
    deliveryId: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined> {
    const r = this.byId.get(deliveryId);
    if (!r || r.organizationId !== organizationId) return undefined;
    return r;
  }

  async save(receipt: DeliveryReceipt): Promise<DeliveryReceipt> {
    const existingId = this.byIdem.get(receipt.idempotencyKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (existing && existing.status === "SUCCEEDED") return existing;
    }
    this.byId.set(receipt.deliveryId, receipt);
    this.byIdem.set(receipt.idempotencyKey, receipt.deliveryId);
    return receipt;
  }
}
