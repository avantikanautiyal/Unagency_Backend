/**
 * Placeholder pattern detector — heuristic frequency analysis only.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  LearningPattern,
  LearningRequest,
  LearningSignal,
  PatternKind,
} from "../contracts/learning-models";
import type { IPatternDetector } from "../interfaces/learning-ports";

export class PlaceholderPatternDetector implements IPatternDetector {
  detect(
    signals: readonly LearningSignal[],
    _request: LearningRequest
  ): Result<readonly LearningPattern[]> {
    const patterns: LearningPattern[] = [];
    const byKind = groupBy(signals, (s) => s.kind);

    for (const [kind, group] of Object.entries(byKind)) {
      if (group.length < 2) continue;
      const avg = group.reduce((sum, s) => sum + s.normalizedValue, 0) / group.length;
      const patternKind = mapKindToPattern(kind, avg);
      if (!patternKind) continue;

      patterns.push({
        patternId: `lpat_${randomUUID()}`,
        kind: patternKind,
        description: `Detected ${patternKind} across ${group.length} ${kind} signals`,
        frequency: group.length,
        confidence: clamp01(avg),
        signalIds: group.map((s) => s.signalId),
        detectedAt: new Date().toISOString(),
      });
    }

    return success(patterns);
  }
}

function groupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
  }
  return groups;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function mapKindToPattern(kind: string, avg: number): PatternKind | undefined {
  if (kind === "quality" && avg < 0.5) return "quality_degradation";
  if (kind === "latency" && avg < 0.4) return "latency_spike";
  if (kind === "cost" && avg > 0.7) return "cost_increase";
  if (kind === "brand" && avg < 0.5) return "brand_drift";
  if (kind === "evaluation" && avg < 0.5) return "evaluation_failure";
  if (kind === "human" && avg < 0.5) return "human_review_spike";
  if (kind === "routing" && avg < 0.5) return "routing_imbalance";
  if (avg < 0.3) return "recurring_failure";
  return undefined;
}
