/**
 * Leaderboard engine.
 */

import { success, type Result } from "../../shared/result";
import type {
  CapabilityLeaderboard,
  DepartmentLeaderboard,
  ModelLeaderboard,
} from "../contracts/leaderboard";
import type { DepartmentKind, LeaderboardScope } from "../contracts/enums";
import type { ILeaderboardEngine } from "../interfaces/model-intelligence";
import type { ModelScoreCard } from "../contracts/scoring";

export class DefaultLeaderboardEngine implements ILeaderboardEngine {
  constructor(
    private readonly scoreCards: readonly ModelScoreCard[],
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  global(): Result<ModelLeaderboard> {
    return this.build("global");
  }

  forProvider(providerId: string): Result<ModelLeaderboard> {
    const filtered = this.scoreCards.filter((s) => s.providerId === providerId);
    return this.build("provider", providerId, filtered);
  }

  forDepartment(department: DepartmentKind): Result<DepartmentLeaderboard> {
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

  forCapability(capabilityId: string): Result<CapabilityLeaderboard> {
    const sorted = [...this.scoreCards].sort((a, b) => b.weightedOverall - a.weightedOverall);
    return success({
      capabilityId,
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

  forScope(scope: LeaderboardScope, scopeId?: string): Result<ModelLeaderboard> {
    return this.build(scope, scopeId);
  }

  private build(
    scope: LeaderboardScope,
    scopeId?: string,
    cards: readonly ModelScoreCard[] = this.scoreCards
  ): Result<ModelLeaderboard> {
    const sorted = [...cards].sort((a, b) => b.weightedOverall - a.weightedOverall);
    return success({
      scope,
      scopeId,
      entries: sorted.slice(0, 30).map((s, i) => ({
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
