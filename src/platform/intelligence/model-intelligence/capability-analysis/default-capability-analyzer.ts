/**
 * Capability and department analyzers.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { DepartmentKind } from "../contracts/enums";
import type { DepartmentLeaderboard } from "../contracts/leaderboard";
import type { ICapabilityAnalyzer, IDepartmentAnalyzer } from "../interfaces/model-intelligence";
import type { ModelScoreCard } from "../contracts/scoring";

const CAPABILITY_BENCHMARK_MAP: Record<string, string> = {
  "content.create.carousel": "marketing",
  "text.generate": "conversation",
  "text.chat": "conversation",
  "reasoning.analyze": "reasoning",
  "image.generate": "image_generation",
  "embedding.generate": "long_context",
  "vision.analyze": "vision",
};

export class DefaultCapabilityAnalyzer implements ICapabilityAnalyzer {
  analyze(model: CanonicalModel): Result<readonly string[]> {
    return success(model.capabilities.map((c) => c.capabilityId));
  }

  scoreForCapability(model: CanonicalModel, capabilityId: string): Result<number> {
    const bench = CAPABILITY_BENCHMARK_MAP[capabilityId] ?? "conversation";
    const base = model.qualityTier === "frontier" ? 0.9 : model.qualityTier === "premium" ? 0.8 : 0.65;
    const creativeBoost =
      capabilityId.includes("content") || capabilityId.includes("carousel") ? 0.08 : 0;
    const hasCap = model.capabilities.some((c) => c.capabilityId === capabilityId);
    return success(Math.min(0.99, base + creativeBoost + (hasCap ? 0.05 : -0.1)));
  }
}

export class DefaultDepartmentAnalyzer implements IDepartmentAnalyzer {
  constructor(
    private readonly scoreCards: readonly ModelScoreCard[] = [],
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  scoreForDepartment(_model: CanonicalModel, _department: DepartmentKind): Result<number> {
    return success(0.75);
  }

  rankDepartment(department: DepartmentKind): Result<DepartmentLeaderboard> {
    const sorted = [...this.scoreCards].sort((a, b) => b.weightedOverall - a.weightedOverall);
    return success({
      department,
      entries: sorted.slice(0, 20).map((s, i) => ({
        rank: i + 1,
        modelId: s.modelId,
        displayName: s.displayName,
        providerId: s.providerId,
        score: s.weightedOverall * 100,
      })),
      computedAt: this.nowIso(),
    });
  }
}
