/**
 * Insight generator — derives learning insights from patterns and statistics.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { LearningInsight } from "../contracts/learning-models";
import type { IInsightGenerator, RecommendationInput } from "../interfaces/learning-ports";

export class PlaceholderInsightGenerator implements IInsightGenerator {
  generate(input: RecommendationInput): Result<readonly LearningInsight[]> {
    const insights: LearningInsight[] = [];

    if (input.statistics.aggregates[0]) {
      const agg = input.statistics.aggregates[0];
      insights.push({
        insightId: `lins_${randomUUID()}`,
        title: "Signal aggregate summary",
        description: `Observed ${agg.count} signals with average ${agg.average.toFixed(2)}`,
        severity: agg.average < 0.4 ? "warning" : "info",
        signalIds: input.signals.map((s) => s.signalId),
        generatedAt: new Date().toISOString(),
      });
    }

    for (const pattern of input.patterns) {
      insights.push({
        insightId: `lins_${randomUUID()}`,
        title: `Pattern: ${pattern.kind}`,
        description: pattern.description,
        severity: pattern.confidence < 0.4 ? "critical" : "warning",
        patternId: pattern.patternId,
        signalIds: pattern.signalIds,
        generatedAt: new Date().toISOString(),
      });
    }

    return success(insights);
  }
}
