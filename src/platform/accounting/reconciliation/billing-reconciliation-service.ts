/**
 * Provider billing reconciliation foundation.
 */

import { randomUUID } from "crypto";
import { BILLING_RECONCILIATION_STATUS } from "../contracts/enums";
import type {
  AIBillingReconciliationRecord,
  ProviderBillingSyncState,
} from "../contracts/billing-reconciliation";
import { PROVIDER_BILLING_SYNC_STATUS } from "../contracts/billing-reconciliation";
import { AIBillingReconciliationModel } from "../../infrastructure/durability/mongo/models/ai-billing-reconciliation.model";
import { ProviderBillingSyncStateModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-sync-state.model";

export interface IProviderBillingAdapter {
  readonly providerId: string;
  fetchBillingPeriod(input: {
    readonly providerAccount?: string | null;
    readonly periodStart: string;
    readonly periodEnd: string;
  }): Promise<readonly ProviderBillingLineItem[]>;
}

export interface ProviderBillingLineItem {
  readonly providerUsageId: string | null;
  readonly providerRequestId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly modelId?: string | null;
  readonly completedAt?: string | null;
}

export class BillingReconciliationService {
  private readonly syncStateCache = new Map<string, ProviderBillingSyncState>();

  getSyncState(providerId: string, providerAccount?: string | null): ProviderBillingSyncState {
    const key = `${providerId}:${providerAccount ?? "default"}`;
    return (
      this.syncStateCache.get(key) ?? {
        providerId,
        providerAccount: providerAccount ?? null,
        lastSuccessfulSyncAt: null,
        providerDataThrough: null,
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.IDLE,
        syncError: null,
      }
    );
  }

  async hydrateSyncStateFromStore(): Promise<void> {
    const docs = await ProviderBillingSyncStateModel.find({}).lean();
    for (const doc of docs) {
      const row = doc as {
        providerId: string;
        providerAccount?: string | null;
        lastSuccessfulSyncAt?: string | null;
        providerDataThrough?: string | null;
        syncStatus: string;
        syncError?: string | null;
      };
      const key = `${row.providerId}:${row.providerAccount ?? "default"}`;
      this.syncStateCache.set(key, {
        providerId: row.providerId,
        providerAccount: row.providerAccount ?? null,
        lastSuccessfulSyncAt: row.lastSuccessfulSyncAt ?? null,
        providerDataThrough: row.providerDataThrough ?? null,
        syncStatus: row.syncStatus as ProviderBillingSyncState["syncStatus"],
        syncError: row.syncError ?? null,
      });
    }
  }

  async recordReconciliation(
    record: Omit<AIBillingReconciliationRecord, "reconciliationId" | "syncedAt">
  ): Promise<AIBillingReconciliationRecord> {
    const full: AIBillingReconciliationRecord = {
      ...record,
      reconciliationId: `recon_${randomUUID()}`,
      syncedAt: new Date().toISOString(),
    };
    await AIBillingReconciliationModel.create(full);
    return full;
  }

  async markSyncSuccess(
    providerId: string,
    providerAccount: string | null,
    providerDataThrough: string
  ): Promise<void> {
    const key = `${providerId}:${providerAccount ?? "default"}`;
    this.syncStateCache.set(key, {
      providerId,
      providerAccount,
      lastSuccessfulSyncAt: new Date().toISOString(),
      providerDataThrough,
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.SUCCESS,
      syncError: null,
    });
  }

  async markSyncError(
    providerId: string,
    providerAccount: string | null,
    error: string
  ): Promise<void> {
    const key = `${providerId}:${providerAccount ?? "default"}`;
    const prev = this.getSyncState(providerId, providerAccount);
    this.syncStateCache.set(key, {
      ...prev,
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
      syncError: error,
    });
  }

  createAggregateReconciliation(input: {
    readonly providerId: string;
    readonly providerAccount?: string | null;
    readonly providerBillingPeriod: string;
    readonly agencyBillingPeriod: string;
    readonly providerAmount: string;
    readonly providerCurrency: string;
    readonly internalAmountUsd: string;
    readonly varianceAmountUsd: string;
    readonly variancePercentage: string;
    readonly matchedUsageCount: number;
    readonly unmatchedUsageCount: number;
    readonly providerDataThrough: string | null;
    readonly reconciliationReason: string;
  }): Promise<AIBillingReconciliationRecord> {
    return this.recordReconciliation({
      providerId: input.providerId,
      providerAccount: input.providerAccount ?? null,
      providerBillingPeriod: input.providerBillingPeriod,
      agencyBillingPeriod: input.agencyBillingPeriod,
      providerUsageId: null,
      providerRequestId: null,
      usageRecordId: null,
      providerAmount: input.providerAmount,
      providerCurrency: input.providerCurrency,
      internalAmountUsd: input.internalAmountUsd,
      varianceAmountUsd: input.varianceAmountUsd,
      variancePercentage: input.variancePercentage,
      matchedUsageCount: input.matchedUsageCount,
      unmatchedUsageCount: input.unmatchedUsageCount,
      status: BILLING_RECONCILIATION_STATUS.AGGREGATE,
      providerDataThrough: input.providerDataThrough,
      reconciliationReason: input.reconciliationReason,
      isAggregate: true,
    });
  }
}

let defaultReconciliationService: BillingReconciliationService | null = null;

export function getBillingReconciliationService(): BillingReconciliationService {
  if (!defaultReconciliationService) {
    defaultReconciliationService = new BillingReconciliationService();
  }
  return defaultReconciliationService;
}
