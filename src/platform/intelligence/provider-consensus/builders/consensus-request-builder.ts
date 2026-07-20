/**
 * Consensus request builder.
 */

import type { ConsensusCandidate } from "../contracts/candidate";
import type { ConsensusRequest } from "../contracts/request";
import type { ConsensusStrategyKind, MergeMode } from "../contracts/enums";

export class ConsensusRequestBuilder {
  private requestId = "";
  private candidates: ConsensusCandidate[] = [];
  private strategy: ConsensusStrategyKind = "best_quality";
  private mergeMode?: MergeMode;

  static create(): ConsensusRequestBuilder {
    return new ConsensusRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withCandidates(candidates: readonly ConsensusCandidate[]): this {
    this.candidates = [...candidates];
    return this;
  }

  addCandidate(candidate: ConsensusCandidate): this {
    this.candidates.push(candidate);
    return this;
  }

  withStrategy(strategy: ConsensusStrategyKind): this {
    this.strategy = strategy;
    return this;
  }

  withMergeMode(mode: MergeMode): this {
    this.mergeMode = mode;
    return this;
  }

  build(): ConsensusRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (this.candidates.length === 0) throw new Error("candidates required");
    return Object.freeze({
      requestId: this.requestId,
      candidates: this.candidates,
      strategy: this.strategy,
      mergeMode: this.mergeMode,
    });
  }
}
