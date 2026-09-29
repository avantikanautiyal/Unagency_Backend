/**
 * Bootstraps the AI accounting platform.
 */

import { InMemoryPricingRegistry } from "./pricing/pricing-registry";
import { InMemoryFxRateService } from "./pricing/fx-rate-service";
import { MongoUsageLedger, InMemoryUsageLedger } from "./ledger/usage-ledger";
import {
  UsageAccountingService,
  setUsageAccountingService,
} from "./usage/usage-accounting-service";
import { AIModelPricingModel } from "../infrastructure/durability/mongo/models/ai-model-pricing.model";
import { buildPricingRecordsFromSeed } from "./pricing/pricing-seed-loader";
import { getBillingReconciliationService } from "./reconciliation/billing-reconciliation-service";
import mongoose from "mongoose";

export interface AccountingPlatform {
  readonly accounting: UsageAccountingService;
  readonly ledger: MongoUsageLedger | InMemoryUsageLedger;
}

export async function bootAccountingPlatform(options?: {
  readonly useMongo?: boolean;
  readonly seedPricing?: boolean;
}): Promise<AccountingPlatform> {
  const useMongo = options?.useMongo ?? true;
  const ledger = useMongo ? new MongoUsageLedger() : new InMemoryUsageLedger();
  const pricing = InMemoryPricingRegistry.fromSeed();

  if (options?.seedPricing !== false && useMongo) {
    if (mongoose.connection.readyState === 1) {
      const seedVersion = "seed-v2";
      const hasCurrentSeed = await AIModelPricingModel.countDocuments({
        pricingVersion: seedVersion,
      });
      if (hasCurrentSeed === 0) {
        const now = new Date().toISOString();
        const records = buildPricingRecordsFromSeed(now);
        await AIModelPricingModel.updateMany(
          { pricingVersion: { $ne: seedVersion }, active: true },
          { $set: { active: false, updatedAt: now } }
        ).catch(() => {
          /* non-fatal */
        });
        await AIModelPricingModel.insertMany(records, { ordered: false }).catch(() => {
          /* ignore duplicate seed races */
        });
      }
    } else {
      console.warn(
        "[Accounting] pricing seed skipped — MongoDB not connected (readyState=%s)",
        mongoose.connection.readyState
      );
    }
  }

  const fx = new InMemoryFxRateService();
  const accounting = new UsageAccountingService(ledger, pricing, fx);
  setUsageAccountingService(accounting);

  const reconciliation = getBillingReconciliationService();
  if (useMongo && mongoose.connection.readyState === 1) {
    await reconciliation.hydrateSyncStateFromStore().catch(() => {
      /* non-fatal at boot */
    });
  }

  return { accounting, ledger };
}
