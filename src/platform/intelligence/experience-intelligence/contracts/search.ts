/**
 * Experience search contracts.
 */

import type { ApplicabilityConditions } from "./applicability";
import type { Experience } from "./experience";
import type { ExperienceCategory } from "./enums";

export interface ExperienceSearchQuery {
  readonly queryId: string;
  readonly capabilityId?: string;
  readonly department?: string;
  readonly workflowId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly taskType?: string;
  readonly language?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly promptTemplateId?: string;
  readonly correctionKind?: string;
  readonly category?: ExperienceCategory;
  readonly conditions?: ApplicabilityConditions;
  readonly similarTo?: string;
  readonly limit?: number;
}

export interface ExperienceSearchResult {
  readonly queryId: string;
  readonly experiences: readonly Experience[];
  readonly totalMatches: number;
  readonly searchedAt: string;
}
