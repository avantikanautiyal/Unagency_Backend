/**
 * Derives execution cost at finalize time from the canonical ledger.
 */

import type { ExecutionCostSummary } from "../../api/contracts/execution";
import { ExecutionCostDeriver } from "./execution-cost-deriver";
import { MongoUsageLedger } from "../ledger/usage-ledger";

const deriver = new ExecutionCostDeriver(new MongoUsageLedger());

export async function deriveFinalizeExecutionCost(
  executionId: string
): Promise<ExecutionCostSummary> {
  try {
    return await deriver.derive(executionId);
  } catch {
    return {
      executionId,
      amount: null,
      currency: "USD",
      status: "unknown",
    };
  }
}
