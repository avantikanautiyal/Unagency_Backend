/**
 * Track A Phase 0 — hard budgets for BrandContextPacket.
 * Prevents prompt pollution (L4/L5). Binder must enforce these.
 */

export interface BrandContextPacketBudgets {
  readonly maxAssets: number;
  readonly maxFacts: number;
  /** Approximate token budget for facts + negatives combined. */
  readonly maxFactTokens: number;
}

/** Default production budgets — change only via Benchmark Lab. */
export const BRAND_CONTEXT_PACKET_BUDGETS: BrandContextPacketBudgets =
  Object.freeze({
    maxAssets: 4,
    maxFacts: 8,
    maxFactTokens: 400,
  });

/** Clarification Gate: never more than this many blocker questions. */
export const MAX_CLARIFICATION_BLOCKERS = 3;

/** Post-guard hard-miss auto-retry cap (Phase A3). Taste never retries. */
export const MAX_HARD_GUARD_RETRIES = 1;
