/**
 * Comparison engine — score candidates across quality dimensions.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ConsensusCandidate } from "../contracts/candidate";
import type {
  CandidateComparison,
  ComparisonReport,
  DimensionScore,
} from "../contracts/comparison";
import type { ComparisonDimension } from "../contracts/enums";
import type { IComparisonEngine } from "../interfaces/consensus";
import { DIMENSION_WEIGHTS } from "../constants";

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function outputText(candidate: ConsensusCandidate): string {
  const output = candidate.execution.response?.output ?? {};
  if (typeof output.content === "string") return output.content;
  return JSON.stringify(output);
}

export class DefaultComparisonEngine implements IComparisonEngine {
  compare(candidates: readonly ConsensusCandidate[]): Result<ComparisonReport> {
    if (candidates.length === 0) {
      return failure(new ValidationError("at least one consensus candidate required"));
    }

    const successful = candidates.filter((c) => c.execution.success && c.execution.response);
    const pool = successful.length > 0 ? successful : candidates;

    const latencies = pool.map(
      (c) => c.observability?.latencyMs ?? c.execution.statistics.totalMs ?? 1000
    );
    const maxLatency = Math.max(...latencies, 1);
    const costs = pool.map((c) => c.observability?.cost ?? 0.01);
    const maxCost = Math.max(...costs, 0.0001);

    const comparisons: CandidateComparison[] = pool.map((c) => {
      const dimensions = this.scoreDimensions(c, maxLatency, maxCost);
      const overallScore = dimensions.reduce((sum, d) => {
        const w = DIMENSION_WEIGHTS[d.dimension] ?? 0.05;
        return sum + d.score * w;
      }, 0);
      return {
        candidateId: c.candidateId,
        providerId: c.providerId,
        dimensions,
        overallScore,
        rank: 0,
      };
    });

    comparisons.sort((a, b) => b.overallScore - a.overallScore);
    const ranked = comparisons.map((c, i) => Object.freeze({ ...c, rank: i + 1 }));

    return success({
      comparisons: ranked,
      winnerCandidateId: ranked[0].candidateId,
      rationale: `Ranked ${ranked.length} candidates; leader ${ranked[0].providerId} score=${ranked[0].overallScore.toFixed(3)}`,
    });
  }

  private scoreDimensions(
    c: ConsensusCandidate,
    maxLatency: number,
    maxCost: number
  ): DimensionScore[] {
    const quality =
      c.observability?.qualityScore ??
      c.evaluation?.summary.overallScore ??
      (c.execution.success ? 0.75 : 0.2);
    const confidence =
      c.confidence?.confidenceScore ??
      (c.execution.success ? 0.7 : 0.3);
    const latency =
      c.observability?.latencyMs ?? c.execution.statistics.totalMs ?? maxLatency;
    const cost = c.observability?.cost ?? maxCost;
    const text = outputText(c);
    const structure = text.trim().startsWith("{") || text.includes("\n") ? 0.8 : 0.55;
    const reasoning = text.toLowerCase().includes("because") || text.length > 200 ? 0.75 : 0.5;
    const safety = c.execution.success ? 0.85 : 0.3;
    const evidence = (c.artifactRefs?.length ?? 0) > 0 ? 0.8 : 0.5;
    const compliance = safety;
    const brand = quality;

    const dims: Array<[ComparisonDimension, number, string]> = [
      ["quality", quality, "evaluation/quality score"],
      ["confidence", confidence, "confidence report or success heuristic"],
      ["latency", clamp(1 - latency / maxLatency), "lower latency preferred"],
      ["cost", clamp(1 - cost / maxCost), "lower cost preferred"],
      ["structure", structure, "output structure heuristic"],
      ["reasoning", reasoning, "reasoning depth heuristic"],
      ["safety", safety, "execution success proxy"],
      ["compliance", compliance, "aligned with safety"],
      ["evidence", evidence, "artifact references"],
      ["brand", brand, "proxied via quality"],
    ];

    return dims.map(([dimension, score, rationale]) =>
      Object.freeze({ dimension, score: clamp(score), rationale })
    );
  }
}
