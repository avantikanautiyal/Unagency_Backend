/**
 * Statistics and snapshot contracts.
 */

import type { ModelSnapshotId } from "./identifiers";
import type { CanonicalModel } from "./model";
import type { CanonicalProvider } from "./provider";

export interface ModelStatistics {
  readonly totalProviders: number;
  readonly totalModels: number;
  readonly activeModels: number;
  readonly deprecatedModels: number;
  readonly modalityCounts: Readonly<Record<string, number>>;
  readonly providerCounts: Readonly<Record<string, number>>;
  readonly capabilityCounts: Readonly<Record<string, number>>;
  readonly computedAt: string;
}

export interface ModelSnapshot {
  readonly snapshotId: ModelSnapshotId;
  readonly providers: readonly CanonicalProvider[];
  readonly models: readonly CanonicalModel[];
  readonly statistics: ModelStatistics;
  readonly capturedAt: string;
}
