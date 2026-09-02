/**
 * Derives execution-level cost summaries from the canonical usage ledger.
 */

import type { ExecutionCostSummary } from "../../api/contracts/execution";
import type { AIUsageRecord } from "../contracts/ai-usage-record";
import { isCostKnown, isCostPending } from "../contracts/ai-usage-record";
import { addUsd } from "../money/usd-money";
import type { IUsageLedger } from "../ledger/usage-ledger";

export function deriveExecutionCostSummary(
  executionId: string,
  records: readonly AIUsageRecord[]
): ExecutionCostSummary {
  const relevant = records.filter((r) => r.executionId === executionId);
  if (relevant.length === 0) {
    return {
      executionId,
      amount: null,
      currency: "USD",
      status: "unknown",
      unknownAttemptCount: 0,
      pricingVersion: null,
    };
  }

  let knownTotal: string | null = null;
  let unknownCount = 0;
  let pendingCount = 0;
  let pricingVersion: string | null = null;
  let providerId: string | undefined;
  let modelId: string | undefined;

  for (const record of relevant) {
    providerId = record.providerId;
    modelId = record.modelId;
    pricingVersion = record.cost.pricingVersion ?? pricingVersion;

    const amount = record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd;
    if (isCostKnown(record.cost.costStatus) && amount) {
      knownTotal = addUsd(knownTotal, amount);
    } else if (isCostPending(record.cost.costStatus)) {
      pendingCount += 1;
      unknownCount += 1;
    } else if (record.cost.costStatus === "NON_BILLABLE") {
      continue;
    } else {
      unknownCount += 1;
    }
  }

  if (knownTotal && pendingCount > 0) {
    return {
      executionId,
      amount: Number(knownTotal),
      currency: "USD",
      status: "partially_calculated",
      knownAmount: Number(knownTotal),
      unknownAttemptCount: unknownCount,
      pricingVersion,
      providerId,
      modelId,
    };
  }

  if (knownTotal) {
    return {
      executionId,
      amount: Number(knownTotal),
      currency: "USD",
      status: "calculated",
      pricingVersion,
      providerId,
      modelId,
    };
  }

  return {
    executionId,
    amount: null,
    currency: "USD",
    status: pendingCount > 0 ? "unknown" : "unavailable",
    unknownAttemptCount: unknownCount,
    pricingVersion,
    providerId,
    modelId,
  };
}

export class ExecutionCostDeriver {
  constructor(private readonly ledger: IUsageLedger) {}

  async derive(executionId: string): Promise<ExecutionCostSummary> {
    const records = await this.ledger.listByExecutionId(executionId);
    return deriveExecutionCostSummary(executionId, records);
  }
}
