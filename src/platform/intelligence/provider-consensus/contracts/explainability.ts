/**
 * Consensus explainability.
 */

export interface ProviderOutcomeExplanation {
  readonly providerId: string;
  readonly candidateId: string;
  readonly outcome: "won" | "lost" | "contributed" | "discarded";
  readonly reason: string;
  readonly score?: number;
}

export interface ConsensusExplanation {
  readonly summary: string;
  readonly strategyRationale: string;
  readonly whyWinner: string;
  readonly whyLosers: readonly string[];
  readonly contributions: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly evidence: readonly string[];
  readonly perProvider: readonly ProviderOutcomeExplanation[];
}
