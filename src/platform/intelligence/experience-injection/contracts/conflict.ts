/**
 * Conflict resolution contracts.
 */

import type { ExperienceId } from "../../experience-intelligence/contracts/identifiers";
import type { Experience } from "../../experience-intelligence/contracts/experience";

export interface ExperienceConflict {
  readonly conflictId: string;
  readonly experienceIds: readonly ExperienceId[];
  readonly dimension: string;
  readonly reason: string;
  readonly winners: readonly ExperienceId[];
  readonly losers: readonly ExperienceId[];
}

export interface ConflictResolutionResult {
  readonly conflicts: readonly ExperienceConflict[];
  readonly resolved: readonly Experience[];
  readonly discarded: readonly ExperienceId[];
}
