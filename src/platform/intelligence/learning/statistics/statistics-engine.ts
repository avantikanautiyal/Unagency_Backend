/**
 * Placeholder statistics engine — aggregates, trends, distributions, frequencies.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  LearningPattern,
  LearningRequest,
  LearningSignal,
  LearningStatistics,
} from "../contracts/learning-models";
import type { IStatisticsEngine } from "../interfaces/learning-ports";

export class PlaceholderStatisticsEngine implements IStatisticsEngine {
  compute(
    signals: readonly LearningSignal[],
    patterns: readonly LearningPattern[],
    _request: LearningRequest
  ): Result<LearningStatistics> {
    const values = signals.map((s) => s.normalizedValue);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const average = count ? sum / count : 0;
    const min = count ? Math.min(...values) : 0;
    const max = count ? Math.max(...values) : 0;

    const kindFreq: Record<string, number> = {};
    for (const signal of signals) {
      kindFreq[signal.kind] = (kindFreq[signal.kind] ?? 0) + 1;
    }

    const buckets: Record<string, number> = {
      low: values.filter((v) => v < 0.33).length,
      medium: values.filter((v) => v >= 0.33 && v < 0.66).length,
      high: values.filter((v) => v >= 0.66).length,
    };

    const trendDirection: "up" | "down" | "stable" =
      average > 0.6 ? "up" : average < 0.4 ? "down" : "stable";

    return success({
      statisticsId: `lstat_${randomUUID()}`,
      aggregates: [
        {
          name: "signal_values",
          count,
          sum,
          average,
          min,
          max,
        },
      ],
      trends: [
        {
          name: "overall_signal_quality",
          direction: trendDirection,
          delta: average - 0.5,
          period: "observation_window",
        },
      ],
      distributions: [{ name: "signal_value_buckets", buckets }],
      frequencies: [{ name: "signal_kind_frequency", occurrences: kindFreq }],
      computedAt: new Date().toISOString(),
    });
  }
}
