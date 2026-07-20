/**
 * Experience snapshot — point-in-time repository export.
 */

import type { ExperienceSnapshotId } from "./identifiers";
import type { Experience } from "./experience";

export interface ExperienceSnapshot {
  readonly snapshotId: ExperienceSnapshotId;
  readonly experiences: readonly Experience[];
  readonly experienceCount: number;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly capturedAt: string;
  readonly version: string;
}
