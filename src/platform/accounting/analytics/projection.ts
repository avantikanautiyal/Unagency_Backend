/**
 * Run-rate projection for current billing period.
 */

import { PROJECTION_STATUS, type ProjectionStatus } from "../contracts/enums";
import { billingPeriodBoundsForDate } from "../contracts/billing-period";
import { parseUsdToMicro, microToUsdString } from "../money/usd-money";

const MIN_ELAPSED_MS = 24 * 60 * 60 * 1000;

export interface ProjectionInput {
  readonly currentKnownSpendUsd: string | null;
  readonly now?: Date;
}

export interface ProjectionResult {
  readonly projectedSpendUsd: string | null;
  readonly projectionStatus: ProjectionStatus;
}

export function projectCurrentPeriodSpend(input: ProjectionInput): ProjectionResult {
  const now = input.now ?? new Date();
  const bounds = billingPeriodBoundsForDate(now);
  const elapsedMs = now.getTime() - bounds.periodStart.getTime();
  const totalMs = bounds.periodEnd.getTime() - bounds.periodStart.getTime();

  const spendMicro = parseUsdToMicro(input.currentKnownSpendUsd);
  const zeroSpend = spendMicro === BigInt(0);

  if (zeroSpend) {
    return {
      projectedSpendUsd: "0",
      projectionStatus: PROJECTION_STATUS.NO_USAGE,
    };
  }

  if (elapsedMs < MIN_ELAPSED_MS) {
    return {
      projectedSpendUsd: null,
      projectionStatus: PROJECTION_STATUS.INSUFFICIENT_DATA,
    };
  }

  if (spendMicro == null || spendMicro <= BigInt(0) || elapsedMs <= 0) {
    return {
      projectedSpendUsd: null,
      projectionStatus: PROJECTION_STATUS.INSUFFICIENT_DATA,
    };
  }

  const projected = (spendMicro * BigInt(totalMs)) / BigInt(elapsedMs);
  return {
    projectedSpendUsd: microToUsdString(projected),
    projectionStatus: PROJECTION_STATUS.PROJECTED,
  };
}
