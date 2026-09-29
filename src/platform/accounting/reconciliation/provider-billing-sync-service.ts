/**
 * Provider billing synchronization — external reconciliation source (NOT real-time).
 */

import { randomUUID } from "crypto";
import { OpenAIBillingAdapter } from "./openai-billing-adapter";
import { AnthropicBillingAdapter } from "./anthropic-billing-adapter";
import { XaiBillingAdapter } from "./xai-billing-adapter";
import { RunwayBillingAdapter } from "./runway-billing-adapter";
import { ElevenLabsBillingAdapter } from "./elevenlabs-billing-adapter";
import { GeminiBillingAdapter } from "./gemini-billing-adapter";
import { ProviderBillingLineModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-line.model";
import { ProviderBillingSyncStateModel } from "../../infrastructure/durability/mongo/models/ai-provider-billing-sync-state.model";
import { AIUsageRecordModel } from "../../infrastructure/durability/mongo/models/ai-usage-record.model";
import { PROVIDER_BILLING_SYNC_STATUS } from "../contracts/billing-reconciliation";
import { formatBillingPeriod } from "../contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../money/usd-money";
import { getBillingReconciliationService } from "./billing-reconciliation-service";
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
  private readonly anthropic = new AnthropicBillingAdapter();
  private readonly xai = new XaiBillingAdapter();
  private readonly runway = new RunwayBillingAdapter();
  private readonly elevenLabs = new ElevenLabsBillingAdapter();
  private readonly gemini = new GeminiBillingAdapter();

  async syncConfiguredProviders(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
    readonly providerAccount?: string | null;
  }): Promise<readonly ProviderBillingSyncResult[]> {
    // Each provider syncs independently — one failing provider must not block the others.
    const failed = (providerId: string): ProviderBillingSyncResult => ({
      providerId,
      linesImported: 0,
      linesSkipped: 0,
      internalAmountUsd: null,
      providerAmountUsd: null,
      varianceUsd: null,
      providerDataThrough: null,
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
    });
    const tasks: Array<Promise<readonly ProviderBillingSyncResult[]>> = [];
    if (this.openAi.isConfigured()) {
      tasks.push(
        this.syncOpenAiCosts(input).then(
          (r) => [r],
          () => [failed(this.openAi.providerId)]
        )
      );
    }
    if (this.anthropic.isConfigured()) {
      tasks.push(
        this.syncAnthropicCosts({
          startingAt: new Date(input.startTimeSec * 1000).toISOString(),
          endingAt: new Date(input.endTimeSec * 1000).toISOString(),
          providerAccount: input.providerAccount,
        }).then(
          (r) => [r],
          () => [failed(this.anthropic.providerId)]
        )
      );
    }
    for (const adapter of [this.xai, this.runway, this.elevenLabs]) {
      if (!adapter.isConfigured()) continue;
      tasks.push(
        this.syncSingleProviderCosts({
          providerId: adapter.providerId,
          providerAccount: input.providerAccount ?? null,
          startTimeSec: input.startTimeSec,
          endTimeSec: input.endTimeSec,
          reconciliationReason: `${adapter.providerId.replace("provider.", "")}_usage_api`,
          fetchLines: () => adapter.fetchAllCosts(input),
        }).then(
          (r) => [r],
          () => [failed(adapter.providerId)]
        )
      );
    }
    if (this.gemini.isConfigured()) {
      tasks.push(
        this.syncGeminiCosts(input).catch(() => this.gemini.providerIds.map(failed))
      );
    }
    return (await Promise.all(tasks)).flat();
  }

  /** Providers whose org-level cost reports we can pull (billing credentials present). */
  configuredProviderIds(): string[] {
    const ids: string[] = [];
    if (this.openAi.isConfigured()) ids.push(this.openAi.providerId);
    if (this.anthropic.isConfigured()) ids.push(this.anthropic.providerId);
    for (const adapter of [this.xai, this.runway, this.elevenLabs]) {
      if (adapter.isConfigured()) ids.push(adapter.providerId);
    }
    if (this.gemini.isConfigured()) ids.push(...this.gemini.providerIds);
    return ids;
  }

  /** xAI / Runway / ElevenLabs: one provider id, one fetch, one reconciliation. */
  private async syncSingleProviderCosts(input: {
    readonly providerId: string;
    readonly providerAccount: string | null;
    readonly startTimeSec: number;
    readonly endTimeSec: number;
    readonly reconciliationReason: string;
    readonly fetchLines: () => Promise<readonly ProviderBillingLineItem[]>;
  }): Promise<ProviderBillingSyncResult> {
    const { providerId, providerAccount } = input;
    await this.persistSyncState(providerId, providerAccount, {
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.SYNCING,
      syncError: null,
    });

    try {
      const lines = await input.fetchLines();
      return await this.finalizeSync({
        providerId,
        providerAccount,
        lines,
        periodStart: new Date(input.startTimeSec * 1000).toISOString(),
        periodEnd: new Date(input.endTimeSec * 1000).toISOString(),
        reconciliationReason: input.reconciliationReason,
      });
    } catch (error) {
      logAccountingError(`provider_billing_sync_${providerId.replace("provider.", "")}`, error, {
        providerId,
      });
      incrementAccountingMetric("providerBillingSyncFailures");
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
        syncError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gemini API costs from the Cloud Billing BigQuery export. One query feeds both
   * provider.gemini (text) and provider.google (image/video) — see gemini-billing-adapter.
   */
  async syncGeminiCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
    readonly providerAccount?: string | null;
  }): Promise<readonly ProviderBillingSyncResult[]> {
    const providerAccount = input.providerAccount ?? null;
    const providerIds = this.gemini.providerIds;
    for (const providerId of providerIds) {
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.SYNCING,
        syncError: null,
      });
    }

    try {
      const byProvider = await this.gemini.fetchAllCostsByProvider(input);
      const results: ProviderBillingSyncResult[] = [];
      for (const providerId of providerIds) {
        results.push(
          await this.finalizeSync({
            providerId,
            providerAccount,
            lines: byProvider.get(providerId) ?? [],
            periodStart: new Date(input.startTimeSec * 1000).toISOString(),
            periodEnd: new Date(input.endTimeSec * 1000).toISOString(),
            reconciliationReason: "gcp_billing_export_bigquery",
          })
        );
      }
      return results;
    } catch (error) {
      logAccountingError("provider_billing_sync_gemini", error, { providerIds: [...providerIds] });
      incrementAccountingMetric("providerBillingSyncFailures");
      for (const providerId of providerIds) {
        await this.persistSyncState(providerId, providerAccount, {
          syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
          syncError: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

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

      return await this.finalizeSync({
        providerId,
        providerAccount,
        lines,
        periodStart: new Date(input.startTimeSec * 1000).toISOString(),
        periodEnd: new Date(input.endTimeSec * 1000).toISOString(),
        reconciliationReason: "aggregate_daily_costs_api",
      });
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

  /**
   * Sync Anthropic org costs via Admin Cost Report API.
   * Docs: https://platform.claude.com/docs/en/manage-claude/usage-cost-api
   */
  async syncAnthropicCosts(input: {
    readonly startingAt: string;
    readonly endingAt: string;
    readonly providerAccount?: string | null;
  }): Promise<ProviderBillingSyncResult> {
    const providerId = "provider.anthropic";
    const providerAccount = input.providerAccount ?? null;

    if (!this.anthropic.isConfigured()) {
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
        syncError: "ANTHROPIC_ADMIN_API_KEY not configured",
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
      const lines = await this.anthropic.fetchAllCosts({
        startingAt: input.startingAt,
        endingAt: input.endingAt,
      });

      return await this.finalizeSync({
        providerId,
        providerAccount,
        lines,
        periodStart: input.startingAt,
        periodEnd: input.endingAt,
        reconciliationReason: "anthropic_cost_report_api",
      });
    } catch (error) {
      logAccountingError("provider_billing_sync_anthropic", error, { providerId });
      incrementAccountingMetric("providerBillingSyncFailures");
      await this.persistSyncState(providerId, providerAccount, {
        syncStatus: PROVIDER_BILLING_SYNC_STATUS.ERROR,
        syncError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async finalizeSync(input: {
    readonly providerId: string;
    readonly providerAccount: string | null;
    readonly lines: readonly ProviderBillingLineItem[];
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly reconciliationReason: string;
  }): Promise<ProviderBillingSyncResult> {
    let imported = 0;
    let skipped = 0;
    let providerMicro = BigInt(0);

    for (const line of input.lines) {
      const stored = await this.storeBillingLine(input.providerId, input.providerAccount, line);
      if (stored) {
        imported += 1;
      } else {
        skipped += 1;
      }
      // Count every line the provider reported for the window, including re-synced ones.
      const micro = parseUsdToMicro(line.currency.toUpperCase() === "USD" ? line.amount : null);
      if (micro != null) providerMicro += micro;
    }

    const internalMicro = await this.sumInternalLedgerUsd(
      input.providerId,
      input.periodStart,
      input.periodEnd
    );
    const providerAmountUsd = providerMicro > BigInt(0) ? microToUsdString(providerMicro) : "0";
    const internalAmountUsd =
      internalMicro > BigInt(0) ? microToUsdString(internalMicro) : "0";
    const varianceMicro = providerMicro - internalMicro;
    const varianceUsd = microToUsdString(varianceMicro < BigInt(0) ? -varianceMicro : varianceMicro);

    const providerDataThrough = input.periodEnd;
    await this.persistSyncState(input.providerId, input.providerAccount, {
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.SUCCESS,
      syncError: null,
      lastSuccessfulSyncAt: new Date().toISOString(),
      providerDataThrough,
      providerDataFrom: input.periodStart,
    });

    const reconciliation = getBillingReconciliationService();
    await reconciliation.createAggregateReconciliation({
      providerId: input.providerId,
      providerAccount: input.providerAccount,
      providerBillingPeriod: formatBillingPeriod(new Date(input.periodStart)),
      agencyBillingPeriod: formatBillingPeriod(new Date(input.periodStart)),
      providerAmount: providerAmountUsd,
      providerCurrency: "USD",
      internalAmountUsd,
      varianceAmountUsd: varianceUsd,
      variancePercentage:
        internalMicro > BigInt(0)
          ? String(Number((varianceMicro * BigInt(10000)) / internalMicro) / 100)
          : "0",
      matchedUsageCount: 0,
      unmatchedUsageCount: input.lines.length,
      providerDataThrough,
      reconciliationReason: input.reconciliationReason,
    });

    if (varianceMicro !== BigInt(0)) {
      incrementAccountingMetric("reconciliationMismatches");
    }

    return {
      providerId: input.providerId,
      linesImported: imported,
      linesSkipped: skipped,
      internalAmountUsd,
      providerAmountUsd,
      varianceUsd,
      providerDataThrough,
      syncStatus: PROVIDER_BILLING_SYNC_STATUS.SUCCESS,
    };
  }

  /**
   * Upsert by provider line identity. Provider daily buckets are revised while the day is
   * still open (and for late-arriving usage), so re-syncs must overwrite the stored amount.
   */
  private async storeBillingLine(
    providerId: string,
    providerAccount: string | null,
    line: ProviderBillingLineItem
  ): Promise<boolean> {
    const providerUsageId = line.providerUsageId ?? randomUUID();
    const idempotencyKey = `${providerId}:${providerUsageId}`;
    const bucketStart = normalizeIso(line.completedAt);
    const providerBillingPeriod = bucketStart
      ? formatBillingPeriod(new Date(bucketStart))
      : formatBillingPeriod(new Date());

    try {
      await ProviderBillingLineModel.updateOne(
        { idempotencyKey },
        {
          $set: {
            providerId,
            providerAccount,
            providerUsageId,
            providerRequestId: line.providerRequestId,
            modelId: line.modelId ?? null,
            amount: line.amount,
            currency: line.currency,
            bucketStart,
            bucketEnd: normalizeIso(line.bucketEnd),
            providerBillingPeriod,
            syncedAt: new Date().toISOString(),
            raw: line as unknown as Record<string, unknown>,
          },
          $setOnInsert: {
            billingLineId: `pbill_${randomUUID()}`,
            idempotencyKey,
          },
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      logAccountingError("provider_billing_line_upsert", error, { providerId, idempotencyKey });
      return false;
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
      readonly providerDataFrom?: string | null;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const set: Record<string, unknown> = {
      providerId,
      providerAccount: providerAccount ?? null,
      syncStatus: patch.syncStatus,
      syncError: patch.syncError ?? null,
      updatedAt: now,
    };
    if (patch.lastSuccessfulSyncAt) set.lastSuccessfulSyncAt = patch.lastSuccessfulSyncAt;
    const update: Record<string, unknown> = { $set: set };
    // Coverage only widens: a short manual re-sync must not shrink the known window.
    const through = normalizeIso(patch.providerDataThrough);
    const from = normalizeIso(patch.providerDataFrom);
    if (through) update.$max = { providerDataThrough: through };
    if (from) update.$min = { providerDataFrom: from };
    await ProviderBillingSyncStateModel.findOneAndUpdate(
      { providerId, providerAccount: providerAccount ?? null },
      update,
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

function normalizeIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

let defaultSyncService: ProviderBillingSyncService | null = null;

export function getProviderBillingSyncService(): ProviderBillingSyncService {
  if (!defaultSyncService) {
    defaultSyncService = new ProviderBillingSyncService();
  }
  return defaultSyncService;
}
