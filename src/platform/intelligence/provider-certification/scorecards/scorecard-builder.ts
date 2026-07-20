/**
 * Scorecard builder — aggregates suite results into dimensional scores.
 */

import type { CertificationScorecard, DimensionScore } from "../contracts/scorecard";
import { buildScorecard } from "../contracts/scorecard";
import type { SuiteResult } from "../contracts/suite-result";
import type { IScorecardBuilder } from "../interfaces/certification";
import { PASSING_SCORE_THRESHOLD } from "../constants";

function areaScore(suiteResults: readonly SuiteResult[], areas: readonly string[]): number {
  const relevant = suiteResults.filter((s) =>
    s.areas.some((a) => areas.includes(a))
  );
  if (relevant.length === 0) return 100;
  const total = relevant.reduce((s, r) => s + r.score, 0);
  const max = relevant.reduce((s, r) => s + r.maxScore, 0);
  return max > 0 ? Math.round((total / max) * 100) : 0;
}

export class DefaultScorecardBuilder implements IScorecardBuilder {
  build(suiteResults: readonly SuiteResult[]): CertificationScorecard {
    const dimensions: DimensionScore[] = [
      {
        dimension: "compatibility",
        score: areaScore(suiteResults, ["request_validation", "response_validation", "capability_manifest"]),
        maxScore: 100,
        weight: 2,
        rationale: "Request/response and manifest conformance",
      },
      {
        dimension: "streaming",
        score: areaScore(suiteResults, ["streaming"]),
        maxScore: 100,
        weight: 1,
        rationale: "Streaming profile and translation",
      },
      {
        dimension: "tool_calling",
        score: areaScore(suiteResults, ["tool_calling", "function_calling"]),
        maxScore: 100,
        weight: 1,
        rationale: "Tool and function calling",
      },
      {
        dimension: "json",
        score: areaScore(suiteResults, ["structured_json_output"]),
        maxScore: 100,
        weight: 1,
        rationale: "Structured JSON output",
      },
      {
        dimension: "reliability",
        score: areaScore(suiteResults, ["error_normalization", "retry_behaviour", "timeout_behaviour"]),
        maxScore: 100,
        weight: 2,
        rationale: "Error normalization and retry semantics",
      },
      {
        dimension: "observability",
        score: areaScore(suiteResults, ["observability", "health_reporting", "diagnostics"]),
        maxScore: 100,
        weight: 1,
        rationale: "Health, diagnostics, observability",
      },
      {
        dimension: "security",
        score: areaScore(suiteResults, ["authentication_contract", "region_handling"]),
        maxScore: 100,
        weight: 1,
        rationale: "Authentication and region contracts",
      },
      {
        dimension: "performance",
        score: areaScore(suiteResults, ["performance", "token_accounting"]),
        maxScore: 100,
        weight: 1,
        rationale: "Performance and token accounting",
      },
    ];

    const card = buildScorecard(dimensions, PASSING_SCORE_THRESHOLD);
    return Object.freeze({
      ...card,
      dimensions: [
        ...card.dimensions,
        {
          dimension: "overall" as const,
          score: card.overallScore,
          maxScore: 100,
          weight: 0,
          rationale: "Weighted aggregate",
        },
      ],
    });
  }
}
