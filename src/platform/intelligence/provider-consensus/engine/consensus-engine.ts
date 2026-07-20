/**
 * Provider Consensus Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asProviderId } from "../../shared/identifiers";
import { asConsensusResultId } from "../contracts/identifiers";
import type { ConsensusRequest } from "../contracts/request";
import type { ConsensusReport, ConsensusResult, AlternativeResult } from "../contracts/result";
import type {
  IProviderConsensusEngine,
  IComparisonEngine,
  IMergeEngine,
  IConsensusConfidenceEngine,
  IConflictArbitration,
  IConsensusStrategy,
} from "../interfaces/consensus";
import type { ConsensusStrategyKind } from "../contracts/enums";
import { createStrategyRegistry } from "../strategies/strategy-registry";
import { buildConsensusExplanation } from "../explainability/explanation-builder";
import { CONSENSUS_VERSION } from "../constants";

export interface ProviderConsensusEngineDeps {
  readonly comparison: IComparisonEngine;
  readonly merger: IMergeEngine;
  readonly confidence: IConsensusConfidenceEngine;
  readonly arbitration: IConflictArbitration;
  readonly strategies?: ReadonlyMap<ConsensusStrategyKind, IConsensusStrategy>;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ProviderConsensusEngine implements IProviderConsensusEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly strategies: ReadonlyMap<ConsensusStrategyKind, IConsensusStrategy>;

  constructor(private readonly deps: ProviderConsensusEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
    this.strategies = deps.strategies ?? createStrategyRegistry(deps.merger);
  }

  async decide(request: ConsensusRequest): Promise<Result<ConsensusReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const comparison = this.deps.comparison.compare(request.candidates);
    if (!comparison.ok) return comparison;

    const arbitration = this.deps.arbitration.arbitrate(
      request.candidates,
      comparison.value
    );
    if (!arbitration.ok) return arbitration;

    const active = request.candidates.filter(
      (c) => !arbitration.value.discarded.includes(c.candidateId)
    );
    const activeComparison =
      active.length === request.candidates.length
        ? comparison
        : this.deps.comparison.compare(active);
    if (!activeComparison.ok) return activeComparison;

    const strategy = this.strategies.get(request.strategy);
    if (!strategy) {
      return failure(new ValidationError(`unknown consensus strategy: ${request.strategy}`));
    }

    const mergeMode = request.mergeMode ?? "none";
    const decision = strategy.decide(active, activeComparison.value, mergeMode);
    if (!decision.ok) return decision;

    const winner = active.find((c) => c.candidateId === decision.value.winningCandidateId);
    if (!winner?.execution.response) {
      return failure(new ValidationError("winning candidate missing execution response"));
    }

    const supporting = active.filter((c) =>
      decision.value.supportingProviderIds.includes(c.providerId)
    );
    const losers = active.filter(
      (c) =>
        c.candidateId !== winner.candidateId &&
        !decision.value.supportingProviderIds.includes(c.providerId)
    );

    const scores = this.deps.confidence.score(winner, supporting, activeComparison.value);
    if (!scores.ok) return scores;

    const alternativeResults: AlternativeResult[] = [
      ...losers,
      ...request.candidates.filter((c) =>
        arbitration.value.discarded.includes(c.candidateId)
      ),
    ].map((c) => ({
      candidateId: c.candidateId,
      providerId: c.providerId,
      output: c.execution.response?.output ?? {},
      score:
        comparison.value.comparisons.find((x) => x.candidateId === c.candidateId)
          ?.overallScore ?? 0,
      reasonNotSelected: arbitration.value.discarded.includes(c.candidateId)
        ? "Discarded during conflict arbitration"
        : `Not selected by ${request.strategy}`,
    }));

    const explanation = buildConsensusExplanation({
      strategy: request.strategy,
      winner,
      supporting,
      losers,
      comparison: activeComparison.value,
      conflictsResolved: arbitration.value.conflictsResolved,
    });

    const consensus: ConsensusResult = Object.freeze({
      resultId: asConsensusResultId(this.createId("consensus")),
      requestId: request.requestId,
      strategy: request.strategy,
      mergeMode,
      winningProviderId: decision.value.winningProviderId,
      winningCandidateId: decision.value.winningCandidateId,
      supportingProviderIds: decision.value.supportingProviderIds,
      mergedOutput: decision.value.mergedOutput,
      canonicalResponse: Object.freeze({
        requestId: request.requestId,
        providerId: asProviderId(decision.value.winningProviderId),
        output: decision.value.mergedOutput,
        usage: winner.execution.response.usage,
        providerRequestId: winner.execution.response.providerRequestId,
        streamed: false,
        finishedAt: this.nowIso(),
      }),
      consensusScore: Object.freeze({
        overall: scores.value.quality,
        agreement: scores.value.agreement,
        quality: scores.value.quality,
        confidence: scores.value.confidence,
      }),
      confidence: scores.value.confidence,
      comparison: activeComparison.value,
      explanation,
      alternativeResults,
      conflictsResolved: arbitration.value.conflictsResolved,
      createdAt: this.nowIso(),
    });

    return success({
      resultId: consensus.resultId,
      request,
      consensus,
      candidatesEvaluated: request.candidates.length,
      durationMs: this.clockMs() - start,
      createdAt: this.nowIso(),
    });
  }

  private validate(request: ConsensusRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.candidates?.length) {
      return new ValidationError("at least one candidate required");
    }
    if (!request.strategy) return new ValidationError("strategy required");
    void CONSENSUS_VERSION;
    return null;
  }
}
