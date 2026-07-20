/**
 * Leaderboard contracts.
 */

import type { LeaderboardScope, DepartmentKind } from "./enums";
import type { CanonicalModelId } from "../../model-registry/contracts/identifiers";

export interface LeaderboardEntry {
  readonly rank: number;
  readonly modelId: CanonicalModelId;
  readonly displayName: string;
  readonly providerId: string;
  readonly score: number;
}

export interface DepartmentLeaderboard {
  readonly department: DepartmentKind;
  readonly entries: readonly LeaderboardEntry[];
  readonly computedAt: string;
}

export interface CapabilityLeaderboard {
  readonly capabilityId: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly computedAt: string;
}

export interface ModelLeaderboard {
  readonly scope: LeaderboardScope;
  readonly scopeId?: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly computedAt: string;
}
