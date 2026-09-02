/**
 * Provider billing reconciliation contracts.
 */

import type { BillingReconciliationStatus } from "./enums";

export const PROVIDER_BILLING_SYNC_STATUS = {
  IDLE: "IDLE",
  SYNCING: "SYNCING",
  SUCCESS: "SUCCESS",
  ERROR: "ERROR",
} as const;

export type ProviderBillingSyncStatus =
  (typeof PROVIDER_BILLING_SYNC_STATUS)[keyof typeof PROVIDER_BILLING_SYNC_STATUS];

export interface ProviderBillingSyncState {
  readonly providerId: string;
  readonly providerAccount: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly providerDataThrough: string | null;
  readonly syncStatus: ProviderBillingSyncStatus;
  readonly syncError: string | null;
}

export interface AIBillingReconciliationRecord {
  readonly reconciliationId: string;
  readonly providerId: string;
  readonly providerAccount: string | null;
  readonly providerBillingPeriod: string;
  readonly agencyBillingPeriod: string;
  readonly providerUsageId: string | null;
  readonly providerRequestId: string | null;
  readonly usageRecordId: string | null;
  readonly providerAmount: string | null;
  readonly providerCurrency: string | null;
  readonly internalAmountUsd: string | null;
  readonly varianceAmountUsd: string | null;
  readonly variancePercentage: string | null;
  readonly matchedUsageCount: number;
  readonly unmatchedUsageCount: number;
  readonly status: BillingReconciliationStatus;
  readonly providerDataThrough: string | null;
  readonly syncedAt: string;
  readonly reconciliationReason: string | null;
  readonly isAggregate: boolean;
}
