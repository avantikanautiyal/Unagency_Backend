/**
 * Provider billing synchronization — external reconciliation source (NOT real-time).
 */

import { randomUUID } from "crypto";
import { OpenAIBillingAdapter } from "./openai-billing-adapter";
import { ProviderBillingLineModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-line.model";
import { ProviderBillingSyncStateModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-sync-state.model";
import { AIUsageRecordModel } from "../../infrastructure/durability/mongo/models/ai-usage-record.model";
import { PROVIDER_BILLING_SYNC_STATUS } from "../contracts/billing-reconciliation";
import { formatBillingPeriod } from "../contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../money/usd-money";
import { getBillingReconciliationService } from "./billing-reconciliation-service";
import { BILLING_RECONCILIATION_STATUS } from "../contracts/enums";
import {
  incrementAccountingMetric,
  logAccountingError,
} from "../observability/accounting-metrics";
import type { ProviderBillingLineItem } from "./billing-reconciliation-service";

export interface ProviderBillingSyncResult {
  readonly providerId: string;
  readonly linesImported: number;
  readonly linesSkipped: number;
  readonly internalAmountUsd: string | null;
  readonly providerAmountUsd: string | null;
  readonly varianceUsd: string | null;
  readonly providerDataThrough: string | null;
  readonly syncStatus: string;
}

export class ProviderBillingSyncService {
  private readonly openAi = new OpenAIBillingAdapter();

  async syncOpenAiCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
    readonly providerAccount?: string | null;
  }): Promise<ProviderBillingSyncResult> {
    const providerId = "provider.openai";
    const providerAccount = input.providerAccount ?? null;

    if (!this.openAi.isConfigured()) {
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
        syncError: "OPENAI_ADMIN_API_KEY not configured",
      });
      return {
        providerId,
        linesImported: 0,
        linesSkipped: 0,
        internalAmountUsd: null,
        providerAmountUsd: null,
        varianceUsd: null,
        providerDataThrough: null,
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
      };
    }

    await this.persistSyncState(providerId, providerAccount, {
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.SYNCING,
      syncError: null,
    });

    try {
      const lines = await this.openAi.fetchAllCosts({
        startTimeSec: input.startTimeSec,
        endTimeSec: input.endTimeSec,
      });

      let imported = 0;
      let skipped = 0;
      let providerMicro = BigInt(0);

      for (const line of lines) {
        const stored = await this.storeBillingLine(providerId, providerAccount, line);
        if (stored) {
          imported += 1;
          const micro = parseUsdToMicro(line.currency.toUpperCase() === "USD" ? line.amount : null);
          if (micro != null) providerMicro += micro;
        } else {
          skipped += 1;
        }
      }

      const periodStart = new Date(input.startTimeSec * 1000).toISOString();
      const periodEnd = new Date(input.endTimeSec * 1000).toISOString();
      const internalMicro = await this.sumInternalLedgerUsd(providerId, periodStart, periodEnd);
      const providerAmountUsd = providerMicro > BigInt(0) ? microToUsdString(providerMicro) : "0";
      const internalAmountUsd =
        internalMicro > BigInt(0) ? microToUsdString(internalMicro) : "0";
      const varianceMicro = providerMicro - internalMicro;
      const varianceUsd = microToUsdString(varianceMicro < BigInt(0) ? -varianceMicro : varianceMicro);

      const providerDataThrough = periodEnd;
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.SUCCESS,
        syncError: null,
        lastSuccessfulSyncAt: new Date().toISOString(),
        providerDataThrough,
      });

      const reconciliation = getBillingReconciliationService();
      await reconciliation.createAggregateReconciliation({
        providerId,
        providerAccount,
        providerBillingPeriod: formatBillingPeriod(new Date(input.startTimeSec * 1000)),
        agencyBillingPeriod: formatBillingPeriod(new Date(input.startTimeSec * 1000)),
        providerAmount: providerAmountUsd,
        providerCurrency: "USD",
        internalAmountUsd,
        varianceAmountUsd: varianceUsd,
        variancePercentage:
          internalMicro > BigInt(0)
            ? String(Number((varianceMicro * BigInt(10000)) / internalMicro) / 100)
            : "0",
        matchedUsageCount: 0,
        unmatchedUsageCount: lines.length,
        providerDataThrough,
        reconciliationReason: "aggregate_daily_costs_api",
      });

      if (varianceMicro !== BigInt(0)) {
        incrementAccountingMetric("reconciliationMismatches");
      }

      return {
        providerId,
        linesImported: imported,
        linesSkipped: skipped,
        internalAmountUsd,
        providerAmountUsd,
        varianceUsd,
        providerDataThrough,
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.SUCCESS,
      };
    } catch (error) {
      logAccountingError("provider_billing_sync_openai", error, { providerId });
      incrementAccountingMetric("providerBillingSyncFailures");
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
        syncError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async storeBillingLine(
    providerId: string,
    providerAccount: string | null,
    line: ProviderBillingLineItem
  ): Promise<boolean> {
    const providerUsageId = line.providerUsageId ?? randomUUID();
    const idempotencyKey = `${providerId}:${providerUsageId}`;
    const billingLineId = `pbill_${randomUUID()}`;
    const bucketStart = line.completedAt ?? null;
    const providerBillingPeriod = bucketStart
      ? formatBillingPeriod(new Date(bucketStart))
      : formatBillingPeriod(new Date());

    try {
      await ProviderBillingLineModel.create({
        billingLineId,
        idempotencyKey,
        providerId,
        providerAccount,
        providerUsageId,
        providerRequestId: line.providerRequestId,
        modelId: line.modelId ?? null,
        amount: line.amount,
        currency: line.currency,
        bucketStart,
        bucketEnd: null,
        providerBillingPeriod,
        syncedAt: new Date().toISOString(),
        raw: line as unknown as Record<string, unknown>,
      });
      return true;
    } catch (error) {
      const duplicate =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000;
      return !duplicate;
    }
  }

  private async sumInternalLedgerUsd(
    providerId: string,
    startIso: string,
    endIso: string
  ): Promise<bigint> {
    const docs = await AIUsageRecordModel.find({
      providerId,
      completedAt: { $gte: startIso, $lt: endIso },
      "cost.costStatus": { $in: ["CALCULATED", "RECONCILED"] },
    }).lean();

    let total = BigInt(0);
    for (const doc of docs) {
      const amount =
        (doc as { cost?: { reportingAmountUsd?: string; estimatedTotalCostUsd?: string } }).cost
          ?.reportingAmountUsd ??
        (doc as { cost?: { estimatedTotalCostUsd?: string } }).cost?.estimatedTotalCostUsd;
      const micro = parseUsdToMicro(amount ?? null);
      if (micro != null) total += micro;
    }
    return total;
  }

  private async persistSyncState(
    providerId: string,
    providerAccount: string | null,
    patch: {
      readonly syncStatus: string;
      readonly syncError?: string | null;
      readonly lastSuccessfulSyncAt?: string | null;
      readonly providerDataThrough?: string | null;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    await ProviderBillingSyncStateModel.findOneAndUpdate(
      { providerId, providerAccount: providerAccount ?? null },
      {
        $set: {
          providerId,
          providerAccount: providerAccount ?? null,
          syncStatus: patch.syncStatus,
          syncError: patch.syncError ?? null,
          lastSuccessfulSyncAt: patch.lastSuccessfulSyncAt ?? undefined,
          providerDataThrough: patch.providerDataThrough ?? undefined,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    const reconciliation = getBillingReconciliationService();
    if (patch.syncStatus === PROVIDER_BILLING_SYNC_STATUS.SUCCESS && patch.providerDataThrough) {
      await reconciliation.markSyncSuccess(providerId, providerAccount, patch.providerDataThrough);
    } else if (patch.syncStatus === PROVIDER_BILLING_SYNC_STATUS.ERROR) {
      await reconciliation.markSyncError(providerId, providerAccount, patch.syncError ?? "unknown");
    }
  }
}

let defaultSyncService: ProviderBillingSyncService | null = null;

export function getProviderBillingSyncService(): ProviderBillingSyncService {
  if (!defaultSyncService) {
    defaultSyncService = new ProviderBillingSyncService();
  }
  return defaultSyncService;
}
